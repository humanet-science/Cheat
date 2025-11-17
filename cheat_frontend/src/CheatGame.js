import React, {useCallback, useEffect, useRef, useState,} from "react";
import confetti from "canvas-confetti";
import WelcomePage from './WelcomePage';
import PlayerHand from './components/CheatGame/PlayerHand';

// Animations
import CardFlyAnimation from "./components/CheatGame/Animations/CardFly";
import PilePickUpAnimation from "./components/CheatGame/Animations/PilePickUp";
import DiscardAnimation from "./components/CheatGame/Animations/Discard";

// Components
import {CardRevealOverlay, GameOverOverlay} from "./components/CheatGame/GameOverlay";
import StatusMessage from "./components/CheatGame/StatusMessages";
import {OpponentIcons} from "./components/CheatGame/Opponent";
import {CenterPile} from "./components/CheatGame/Pile";
import GameMenu from './components/Menu';

// Hooks and utils
import {getPlayerColor, getPlayerPositions, parseCard} from './utils/cardUtils';
import {soundManager} from './utils/soundManager';
import {useActionQueue} from './components/CheatGame/hooks/useActionQueue';
import {useScreenSize} from "./components/CheatGame/hooks/useScreenSize";
import {Logo} from './utils/Logo';

// Constants
import {VALID_RANKS} from "./utils/constants";

export default function CheatGame() {

	const [experimentalMode, setExperimentalMode] = useState(false);
	const [hasJoined, setHasJoined] = useState(false);

	const [ws, setWs] = useState(null);
	const [state, setState] = useState(null);
	const [selectedCards, setSelectedCards] = useState([]);
	const [declaredRank, setDeclaredRank] = useState("");
	const [hasActed, setHasActed] = useState(false); // Track if player has acted
	const prevStateRef = useRef(null);
	const [showRankInput, setShowRankInput] = useState(false); // Whether the rank input box should be shown
	const [opponents, setOpponents] = useState([]);

	// ActionQueue processes incoming messages sequentially
	const {
		actionQueue, setActionQueue, processingRef, addToQueue, processNext, removeProcessed
	} = useActionQueue();

	// Check whether it is human player's turn
	const [isMyTurn, setIsMyTurn] = useState(false);

	// New round
	const [isNewRound, setIsNewRound] = useState(true);

	// Track input error
	const [rankError, setRankError] = useState(false);

	// Track game over
	const [gameOver, setGameOver] = useState(false);
	const [winner, setWinner] = useState(null);

	// Animation states
	const [animatingCards, setAnimatingCards] = useState(null); // {playerId, cards, targetPosition, starting x, starting y}
	const [revealedCards, setRevealedCards] = useState(null); // {cards, wasLying}
	const [pilePickupAnimation, setPilePickupAnimation] = useState(null);

	// Cards on the pile
	const [pileCards, setPileCards] = useState([]);

	// Number of cards played in last hand, so that we can highlight them when it's time to call a bluff
	const [lastPlayedCount, setLastPlayedCount] = useState(0);

	// Discarded ranks
	const [discards, setDiscards] = useState([]); // Track all discarded ranks
	const [discardAnimation, setDiscardAnimation] = useState(null); // {playerId, rank}

	// Player status messages
	const [statusMessages, setStatusMessages] = useState([]);
	const [speakingPlayers, setSpeakingPlayers] = useState(new Set());
	const [messageInput, setMessageInput] = useState("");
	const predefinedMessagesRef = useRef({});

	// Positions of the players at the table: these are dynamically adapted to the screen dimensions
	// We also need a const playerPositions array to trigger re-renders when the screen changes
	const playerPositionsRef = useRef({});
	const [playerPositions, setPlayerPositions] = useState({});
  const [numPlayers, setNumPlayers] = useState(0);
	const { width, height } = useScreenSize();

	const handleJoinGame = (playerName, avatar, num_players) => {

		console.log("handleJoinGame called with:", playerName, avatar, num_players)

		const socket = new WebSocket("ws://localhost:5050/ws");
		console.log("WebSocket created, connecting...");
		socket.onopen = () => {
			console.log("WebSocket connected");

			// Send player info immediately after connection
			socket.send(JSON.stringify({
				type: "player_join", name: playerName, avatar: avatar, num_players
			}));

			setNumPlayers(num_players);
		};

		socket.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			console.log("Received message:", msg);

			if (msg.type === 'new_game') {
				const {type, ...currentState} = msg;
				setState(currentState);
				setHasJoined(true);
				setExperimentalMode(msg.experimental_mode);
				playerPositionsRef.current = getPlayerPositions(msg.num_players);
				predefinedMessagesRef.current = msg.predefined_messages;
				setPlayerPositions(playerPositionsRef.current);
				if (msg.current_player === msg.your_id) {
					setHasActed(false);
				}
				setIsMyTurn(msg.current_player === msg.your_id);
			}

			if (["state", "state_update", "card_played", "bluff_called", "discard", "game_over", "bot_message"].includes(msg.type)) {
				addToQueue(msg);
			}

			if (msg.type === "human_message") {
				const {x, y} = playerPositionsRef.current[msg.sender_id];
				addStatusMessage(msg.sender_id, msg.message, {x, y});
			}

		};

		socket.onerror = (error) => {
			console.error("WebSocket error:", error);
		};

		setWs(socket);
	};

	// Process actions sequentially, and hold actions until animations have finished playing for a smoother
	// game play
	const processActionQueue = async () => {

		if (processingRef.current || animatingCards) return;

		// Get the next action
		const msg = processNext();

		// Pause if the relevant player is currently speaking
		if (["card_played", "bluff_called", "bot_message", "discard"].includes(msg.type)) {
			if (msg && (msg.current_player || msg.sender_id || msg.caller)) {
				const playerId = msg.sender_id || msg.caller || msg.current_player;
				if (playerId && speakingPlayers.has(playerId)) {
					return;
				}
			}
		}

		// Process the action
		processingRef.current = true;
		if (msg.type === "state") {

			// Get the previous state
			const {type, ...currentState} = msg;
			const prevState = prevStateRef.current;

			// First, sync declaredRank with backend so that the declared rank always matches
			// what people are currently playing. If this is NULL, it means a new round has started and a new
			// rank can be declared.
			if (msg.current_rank !== null) {
				setDeclaredRank(msg.current_rank);
			} else if (prevState?.your_id === msg.current_player) {
				setDeclaredRank("");
			}

			// Update the previous state
			prevStateRef.current = currentState;
			setState(currentState);

			// Reset hasActed if it becomes your turn
			if (msg.current_player === msg.your_id) {
				setHasActed(false);
			}
			setIsMyTurn(msg.current_player === msg.your_id);

			// Small delay to let state update
			await new Promise(r => setTimeout(r, 100));

		} else if (msg.type === "card_played") {

			if (msg.declared_rank !== null) {
				setDeclaredRank(msg.declared_rank);
			}
			setIsMyTurn(Boolean(msg?.player_id && msg?.your_id && msg.player_id === msg.your_id));

			// Generate final positions for each card BEFORE animating
			const newCards = Array(msg.card_count)
				.fill(0)
				.map((_, i) => ({
					id: Math.random(), rotation: Math.random() * 60 - 30, // -30 to +30 degrees
					offsetX: Math.random() * 100 - 50,  // -50 to +50 px
					offsetY: Math.random() * 100 - 50, startRotation: -(5 + (i * 5))  // Starting rotation from hand
				}));

			// Animate cards moving to pile
			soundManager.play('cardPlay');
			const {x, y} = playerPositionsRef.current[msg.current_player];
			setAnimatingCards({
				playerId: msg.current_player, cardCount: msg.card_count, declaredRank: msg.declared_rank, x, y, cards: newCards
			});

			// Add status message
			const rankText = msg.declared_rank === "A" ? "Ace" : msg.declared_rank === "K" ? "King" : msg.declared_rank === "Q" ? "Queen" : msg.declared_rank === "J" ? "Jack" : msg.declared_rank;

			const countText = msg.card_count === 1 ? "One" : msg.card_count === 2 ? "Two" : "Three";
			addStatusMessage(msg.current_player, `${countText} ${rankText}${msg.card_count > 1 ? 's' : ''}!`);

			await new Promise(r => setTimeout(r, 1000)); // Wait for animation
			setAnimatingCards(null);

			// Add cards to pile with the SAME positions
			setPileCards(prev => [...prev, ...newCards]);
			// Track how many were just played so we can highlight them when it's time to call bluff
			setLastPlayedCount(msg.card_count);

			// Wait for pile animation
			await new Promise(r => setTimeout(r, 500));

		} else if (msg.type === "bluff_called") {

			setIsMyTurn(Boolean(msg?.current_player && msg?.your_id && msg.current_player === msg.your_id));

			// Show revealed cards
			if (msg.was_lying) {
				soundManager.play('bluffFail');
			} else {
				soundManager.play('bluffSuccess');
			}
			setRevealedCards({
				cards: msg.actual_cards,
				wasLying: msg.was_lying,
				declaredRank: msg.declared_rank,
				caller: msg.caller,
				accused: msg.accused,
				caller_name: msg.caller_name,
				accused_name: msg.accused_name
			});

			// Clear after showing cards
			await new Promise(r => setTimeout(r, 3000)); // wait before clearing

			// Start pile pickup animation
			const pickupPlayerId = msg.was_lying ? msg.accused : msg.caller;
			const {x: targetX, y: targetY} = playerPositionsRef.current[pickupPlayerId];
			if (pileCards.length > 0) {
				soundManager.play('pick_up');
				setPilePickupAnimation({
					playerId: pickupPlayerId, targetX, targetY, cards: [...pileCards] // Copy current pile cards
				});

				setPileCards([]);

				// Wait for pickup animation
				await new Promise(r => setTimeout(r, 1000));
				setPilePickupAnimation(null);
			}

			setRevealedCards(null);
			setLastPlayedCount(0);

			// Cards have been discarded: set a message
		} else if (msg.type === "discard") {

			// Parse: "Player 2 discards 7, K, A."
			const match = msg.result.match(/Player (\d+) discards (.+)\./);
			if (match) {
				const playerId = parseInt(match[1]);
				const ranksStr = match[2]; // "7, K, A"
				const ranks = ranksStr.split(', '); // ["7", "K", "A"]

				// Show animation
				soundManager.play('discard');

				// Add to status messages instead of separate discardAnimation
				const message = playerId === state.your_id ? `You discard ${ranksStr}s` : `Discarding ${ranksStr}s`;
				const {x, y} = playerPositionsRef.current[playerId];
				addStatusMessage(playerId, message, {x, y});

				// Add all ranks to discard list
				setDiscards(prev => [...prev, ...ranks]);

				// Wait for animation
				await new Promise(r => setTimeout(r, 1500));
				setDiscardAnimation(null);
			}

			// Opinion status sent
		} else if (msg.type === "bot_message") {

			const {x, y} = playerPositionsRef.current[msg.sender_id];
			addStatusMessage(msg.sender_id, msg.message, {x, y});

			// Game is over
		} else if (msg.type === "game_over") {

			setWinner(msg.winner);
			setGameOver(true);

			soundManager.play('win');
			// 🎉 Trigger confetti burst
			confetti({
				particleCount: 200, spread: 100, origin: {y: 0.6},
			});
		}

		// remove the processed action
		removeProcessed(); // Remove after processing
		processingRef.current = false;

	};

	useEffect(() => {
		if (actionQueue.length > 0 && !processingRef.current) {
			processActionQueue();
		}
	}, [actionQueue, animatingCards, speakingPlayers]);

	useEffect(() => {
		const aspectRatio = width / height;
		let radiusX, radiusY;

		if (aspectRatio > 1.5) {  // Wide screen
			radiusX = Math.min(width * 0.3, height*1.5);   // Use more horizontal space
			radiusY = height * 0.3;  // But don't squash vertically
		} else if (aspectRatio < 0.5) {
			radiusX = width * 0.35;
			radiusY = Math.min(radiusX * 2, height*0.3);
		} else {  // Tall/narrow screen
			radiusX = Math.min(width, height) * 0.35;
			radiusY = radiusX * 0.9;
		}
		const positions = getPlayerPositions(numPlayers, radiusX, radiusY);
		playerPositionsRef.current = positions;
		setPlayerPositions(positions);
	}, [width, height, numPlayers]);

	// Checks whether the rank needs to be declared; if not, the text box disappears.
	// Also validates the rank, so that only valid ranks are sent to the backend.
	const play = useCallback(() => {

		setIsNewRound(declaredRank === null || declaredRank === "");

		if (!isMyTurn || selectedCards.length === 0 || selectedCards.length > 3) {
			// setShowRankInput(false);
			return;
		}

		// Only require declared rank for new rounds
		if (isNewRound && !declaredRank) {
			// setShowRankInput(false);
			return;
		}

		const normalizedRank = declaredRank.toUpperCase();
		// Check rank before sending
		if (!VALID_RANKS.includes(normalizedRank)) {
			setRankError(true);          // trigger UI feedback
			setTimeout(() => setRankError(false), 500); // reset after wiggle
			return;
		}

		ws.send(JSON.stringify({
			type: "play", declared_rank: declaredRank, cards: selectedCards,
		}));

		// Optimistically update your hand immediately
		setState(prevState => ({
			...prevState, your_hand: prevState.your_hand.filter(card => !selectedCards.includes(card))
		}));

		setSelectedCards([]);
		setHasActed(true);
		setShowRankInput(false);
	}, [selectedCards, declaredRank, ws]);

	// Allow using the Enter key to play, without having to click on the button all the time
	useEffect(() => {
		const handleKeyPress = (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				play();
			}
		};

		window.addEventListener('keydown', handleKeyPress);
		return () => window.removeEventListener('keydown', handleKeyPress);
	}, [play]);

	useEffect(() => {
		if (!state) return;

		const calculatedIsNewRound = !declaredRank; // Calculate locally because we need to use the updated value here
		setIsNewRound(!declaredRank); // "" or null both mean new round
		if (isMyTurn && calculatedIsNewRound) {
			setShowRankInput(true);
		} else {
			setShowRankInput(false);
		}
	}, [state]);

	useEffect(() => {
		if (!state) return;
		if (state.players && state.your_id !== undefined) {
			const newOpponents = state.players
				.filter((player) => player.id !== state.your_id)
				.map((player) => ({
					id: player.id,
					name: player.name,
					avatar: player.avatar,
					cardCount: player.cardCount,
					type: player.type,
					connected: player.connected
				}));

			setOpponents(newOpponents);
		}
	}, [state?.players, state?.your_id]);

	// Load sounds
	useEffect(() => {
		soundManager.loadSound('cardPlay', '/sounds/card_play.mp3', 0.3);
		soundManager.loadSound('bluffSuccess', '/sounds/success.mp3');
		soundManager.loadSound('bluffFail', '/sounds/busted.mp3');
		soundManager.loadSound('callBluff', '/sounds/pop_low.mp3');
		soundManager.loadSound('discard', '/sounds/discard.wav');
		soundManager.loadSound('win', '/sounds/win.wav');
		soundManager.loadSound('pick_up', '/sounds/pick_up.mp3', 0.2);
	}, []);

	// Play sound when Call Bluff! button pops up
	useEffect(() => {
		if (isMyTurn && state?.pile_size > 0 && state?.current_rank && !hasActed) {
			soundManager.play('callBluff');
		}
	}, [isMyTurn, state?.pile_size, state?.current_rank, hasActed]);

	// Floating message bubbles
	useEffect(() => {
		statusMessages.forEach(msg => {
			const element = document.getElementById(`status-${msg.id}`);
			if (element && !element.dataset.animated) {
				element.style.animation = 'floatUp_Bubble 3s ease-out forwards';
				element.dataset.animated = 'true';

				// Remove after animation
				setTimeout(() => {
					setStatusMessages(prev => prev.filter(m => m.id !== msg.id));
				}, 3000);
			}
		});
	}, [statusMessages]);

	const toggleCard = (card) => {
		setSelectedCards((sel) => {
			const newSelection = sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card];
			// Limit to 3 cards
			return newSelection.length <= 3 ? newSelection : sel;
		});
	};

	const callBluff = () => {
		ws.send(JSON.stringify({type: "call"}));
		setHasActed(true);
	};

	const addStatusMessage = (playerId, message) => {

		const playerElement = document.getElementById(`player-${playerId}`);
		if (playerElement) {
			// Add player to speaking set
			setSpeakingPlayers(prev => new Set(prev).add(playerId));
			const rect = playerElement.getBoundingClientRect();
			const position = {
				x: rect.left + rect.width / 2, y: rect.top
			};

			const newMessage = {
				id: Math.random(), playerId, message, position
			};

			setStatusMessages(prev => [...prev, newMessage]);

			// Remove after animation
			setTimeout(() => {
				setStatusMessages(prev => prev.filter(msg => msg.id !== newMessage.id));
				setSpeakingPlayers(prev => {
					const newSet = new Set(prev);
					newSet.delete(playerId);
					return newSet;
				});
			}, 3000);
		}
	};

	// Human message: sends the message input by default
	const sendMessage = useCallback((customMessage = null) => {
		const messageToSend = customMessage || messageInput.trim();

		if (messageToSend && ws) {
			ws.send(JSON.stringify({
				type: "human_message", message: messageToSend, sender_id: state.your_id
			}));

			addStatusMessage(state.your_id, messageToSend);

			if (!customMessage) {
				setMessageInput(""); // Only clear if it was from the input
			}
		}
	}, [messageInput, ws, state?.your_id]);

	// Human click on opponent
	const handlePlayerClick = (opponent) => {
		if (!ws || gameOver) return;

		const cardText = opponent.cardCount === 1 ? "1 card" : `${opponent.cardCount} cards`;
		const message = `Woah, ${opponent.name} only has ${cardText} left!`;

		// Send to backend to broadcast
		ws.send(JSON.stringify({
			type: "human_message", message: message, sender_id: state.your_id
		}));
	};

	if (!hasJoined) {
		return <WelcomePage onJoinGame={handleJoinGame}/>;
	}

	if (!state) {
		return <div>Loading game...</div>;
	}

	return (

		<div className="min-h-screen text-white flex flex-col p-6">

			{/* Game logo */}
			<div className="fixed inset-0 flex items-center justify-center pointer-events-none">
				<Logo className="opacity-20" style={{width: "20rem", height: "auto"}} animationDuration="0s"/>
			</div>

			{/* Game menu */}
			<GameMenu
				ws={ws}
				onQuit={() => {
					if (ws) {
						ws.send(JSON.stringify({ type: "quit", player_id: state.your_id}));
					}
					setHasJoined(false);
					setGameOver(false);
					setWinner(null);
					setSelectedCards([]);
					setActionQueue([]);
					// Close the WebSocket connection
					ws?.close();
					setWs(null);
				}}
				onRestart={() => {
					if (ws) {
						ws.send(JSON.stringify({ type: "new_game" }));
							setSelectedCards([]);
							setActionQueue([]);
							setPileCards([])
					}
				}}
			/>

			{/* Game is over */}
			<GameOverOverlay
				gameOver={gameOver}
				winner={winner}
				state={state}
				ws={ws}
				setGameOver={setGameOver}
				setWinner={setWinner}
				setSelectedCards={setSelectedCards}
				setDeclaredRank={setDeclaredRank}
				setHasActed={setHasActed}
				setPileCards={setPileCards}
				setActionQueue={setActionQueue}
				setIsNewRound={setIsNewRound}
				setIsMyTurn={setIsMyTurn}
				setDiscards={setDiscards}
			/>

			{/* Status Message bubbles floating up from each player */}
			<StatusMessage statusMessages={statusMessages}/>

			{/* Section containing players and cards*/}
			<div className="flex-1 flex items-center justify-center relative">

				{/* Opponents arranged in semi-circle around pile */}
				<OpponentIcons
					opponents={opponents}
					playerPositions={playerPositions}
					handlePlayerClick={handlePlayerClick}
					state={state}
					getPlayerColor={getPlayerColor}
				/>

				<CenterPile
					isMyTurn={isMyTurn}
					state={state}
					hasActed={hasActed}
					pileCards={pileCards}
					lastPlayedCount={lastPlayedCount}
					callBluff={callBluff}
				/>

				<CardRevealOverlay
					revealedCards={revealedCards}
					parseCard={parseCard}
					state={state}
				/>

				<PlayerHand
					isMyTurn={isMyTurn}
					hasActed={hasActed}
					isNewRound={isNewRound}
					showRankInput={showRankInput}
					experimentalMode={experimentalMode}
					rankError={rankError}
					selectedCards={selectedCards}
					state={state}
					sendMessage={sendMessage}
					play={play}
					setDeclaredRank={setDeclaredRank}
					messageInput={messageInput}
					allowedMessages={predefinedMessagesRef.current}
					declaredRank={declaredRank}
					parseCard={parseCard}
					toggleCard={toggleCard}
					setMessageInput={setMessageInput}
					playerPositions={playerPositions}
				/>

				<CardFlyAnimation animatingCards={animatingCards}/>

				<PilePickUpAnimation pilePickupAnimation={pilePickupAnimation}/>

				<DiscardAnimation discards={discards}/>

			</div>
		</div>);
}