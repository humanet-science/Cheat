import React, {useCallback, useEffect, useRef, useState,} from "react";
import confetti from "canvas-confetti";
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

export default function CheatGame({
																		socket, gameConfig, currentRound, onUpdateRound, onExitGame,
																		highlightMenu = false
																	}) {

	// Game state and previous state
	const [state, setState] = useState(currentRound?.state || null);
	const prevStateRef = useRef(null);

	// Player hand selection
	const [selectedCards, setSelectedCards] = useState([]);
	const [declaredRank, setDeclaredRank] = useState("");

	// Whether the player has selected a rank and played
	const [hasActed, setHasActed] = useState(currentRound?.hasActed || false);

	// Whether the rank input box should be shown
	const [showRankInput, setShowRankInput] = useState(false);

	// Whether it is the player's turn
	const [isMyTurn, setIsMyTurn] = useState(currentRound?.currentPlayer === gameConfig.selfId);

	// Opponent player information
	const [opponents, setOpponents] = useState([]);

	// ActionQueue processes incoming messages sequentially
	const {
		actionQueue, setActionQueue, processingRef, addToQueue, processNext, removeProcessed
	} = useActionQueue();

	// Use the persistent data from props
	const {experimentalMode, numPlayers, selfId, predefinedMessages} = gameConfig;

	// New round
	const [isNewRound, setIsNewRound] = useState(true);

	// Track input error
	const [rankError, setRankError] = useState(false);

	// Track game over
	const [gameOver, setGameOver] = useState(false);
	const [winner, setWinner] = useState(null);

	// Track seconds remaining until game resets
	const [countdown, setCountdown] = useState(null);
	const [confirmedCount, setConfirmedCount] = useState(0);
	const [totalHumans, setTotalHumans] = useState(0);

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

	// Positions of the players at the table: these are dynamically adapted to the screen dimensions
	// We also need a const playerPositions array to trigger re-renders when the screen changes
	const playerPositionsRef = useRef({});
	const [playerPositions, setPlayerPositions] = useState({});
	const {width, height} = useScreenSize();

	// Adjust player positions to the width and height of the screen
	useEffect(() => {
		const aspectRatio = width / height;
		let radiusX, radiusY;

		if (aspectRatio > 1.5) {  // Wide screen
			radiusX = Math.min(width * 0.3, height * 1.5);   // Use more horizontal space
			radiusY = height * 0.3;  // But don't squash vertically
		} else if (aspectRatio < 0.5) {
			radiusX = width * 0.35;
			radiusY = Math.min(radiusX * 2, height * 0.3);
		} else {  // Tall/narrow screen
			radiusX = Math.min(width, height) * 0.35;
			radiusY = radiusX * 0.9;
		}
		const positions = getPlayerPositions(numPlayers, selfId, radiusX, radiusY);
		playerPositionsRef.current = positions;
		setPlayerPositions(positions);
	}, [width, height]);

	// Set up WebSocket handlers for gameplay only
	useEffect(() => {
		if (socket) {
			socket.onmessage = (event) => {
				const msg = JSON.parse(event.data);
				console.log("CheatGame received gameplay message:", msg);

				if (msg.type === 'new_round') {
					console.log("Setting up a new round", msg);
					const {type, ...currentState} = msg;
					setState(currentState);
					setCountdown(null);
					setConfirmedCount(0);
					setTotalHumans(0);
					setWinner(null);
					removeAllConnectionTimers();
					setSpeakingPlayers(new Set());
					if (msg.current_player === msg.your_info.id) {
						setHasActed(false);
					}
					setIsMyTurn(msg.current_player === msg.your_info.id);
				}

				if (["state", "state_update", "cards_played", "bluff_called", "discard", "round_over", "bot_message"].includes(msg.type)) {
					addToQueue(msg);
				}

				if (msg.type === "human_message") {
					addStatusMessage(msg.sender_id, msg.message);
				}

				if (msg.type === "countdown") {
					setCountdown(msg.seconds_remaining);
					setConfirmedCount(msg.confirmed_count);
					setTotalHumans(msg.total_humans);
					setIsMyTurn(false);

					// Add a connection info to the missing players for those players waiting to join
					if (!msg.waiting_for_players.includes(state.your_info.id)) {
						// Clear all connection timers first
						removeAllConnectionTimers();

						// Add timers only for players still waiting
						for (const playerId of msg.waiting_for_players) {
							addStatusMessage(playerId, `Waiting for connection (${msg.seconds_remaining}s)`, false, true);
						}
					}
					if (msg.seconds_remaining === 0) {
						removeAllConnectionTimers();
					}
				}
				if (msg.type === "quit_confirmed") {
					removeConnectionTimer(state.your_info.id);
					onExitGame();
				}
			};

			socket.onerror = (error) => {
				console.error("CheatGame WebSocket error:", error);
			};

			socket.onclose = (event) => {
				console.log("CheatGame WebSocket closed:", event.code, event.reason);
			};
		}
	}, [socket, onUpdateRound])

	// Process actions sequentially, and hold actions until animations have finished playing for a smoother
	// game play
	const processActionQueue = async () => {

		if (processingRef.current || animatingCards) return;

		// Get the next action
		const msg = processNext();

		// Pause if the relevant player is currently speaking
		if (["cards_played", "bluff_called", "bot_message", "discard"].includes(msg.type)) {
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
			} else if (prevState?.your_info.id === msg.current_player) {
				setDeclaredRank("");
			}

			// Update the previous state
			prevStateRef.current = currentState;
			setState(currentState);

			// Reset hasActed if it becomes your turn
			if (msg.current_player === msg.your_info.id) {
				setHasActed(false);
			}
			setIsMyTurn(msg.current_player === msg.your_info.id);

			// Small delay to let state update
			await new Promise(r => setTimeout(r, 100));

		} else if (msg.type === "cards_played") {

			if (msg.declared_rank !== null) {
				setDeclaredRank(msg.declared_rank);
			}
			setIsMyTurn(Boolean(msg.player_id === msg.your_info.id));

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
			addStatusMessage(msg.current_player, `${countText} ${rankText}${msg.card_count > 1 ? 's' : ''}!`, true);

			await new Promise(r => setTimeout(r, 1000)); // Wait for animation
			setAnimatingCards(null);

			// Add cards to pile with the SAME positions
			setPileCards(prev => [...prev, ...newCards]);
			// Track how many were just played so we can highlight them when it's time to call bluff
			setLastPlayedCount(msg.card_count);

			// Wait for pile animation
			await new Promise(r => setTimeout(r, 500));

		} else if (msg.type === "bluff_called") {

			setIsMyTurn(Boolean(msg.current_player === msg.your_info.id && msg.was_lying));

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
				const message = playerId === msg.your_info.id ? `You discard ${ranksStr}s` : `Discarding ${ranksStr}s`;
				addStatusMessage(playerId, message);

				// Add all ranks to discard list
				setDiscards(prev => [...prev, ...ranks]);

				// Wait for animation
				await new Promise(r => setTimeout(r, 1500));
				setDiscardAnimation(null);
			}

			// Opinion status sent
		} else if (msg.type === "bot_message") {

			addStatusMessage(msg.sender_id, msg.message);

			// Game is over
		} else if (msg.type === "round_over") {

			setWinner(msg.winner);
			setGameOver(true);
			setPileCards([]);
			setState(prevState => ({
				...prevState, pile_size: 0
			}));
			setIsMyTurn(false);

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

	// Checks whether the rank needs to be declared; if not, the text box disappears.
	// Also validates the rank, so that only valid ranks are sent to the backend.
	const play = useCallback(() => {

		setIsNewRound(declaredRank === null || declaredRank === "");

		if (!isMyTurn || selectedCards.length === 0 || selectedCards.length > 3) {
			return;
		}

		// Only require declared rank for new rounds
		if (isNewRound && !declaredRank) {
			return;
		}

		// Check rank before sending
		const normalizedRank = declaredRank.toUpperCase();
		if (!VALID_RANKS.includes(normalizedRank)) {
			setRankError(true);          // trigger UI feedback
			setTimeout(() => setRankError(false), 500); // reset after wiggle
			return;
		}

		// Broadcast the play to the backend
		socket.send(JSON.stringify({
			type: "cards_played", declared_rank: declaredRank, cards: selectedCards, current_player: state.your_info.id,
			your_info: state.your_info, player_id: state.your_info.id, card_count: selectedCards.length
		}));

		// Optimistically update your hand immediately
		setState(prevState => ({
			...prevState, your_info: {
				...prevState.your_info, hand: prevState.your_info.hand.filter(card => !selectedCards.includes(card))
			}
		}));

		setSelectedCards([]);
		setHasActed(true);
		setShowRankInput(false);
	}, [selectedCards, declaredRank, socket]);

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
		if (state.players && state.your_info.id !== undefined) {
			const newOpponents = state.players
				.filter((player) => player.your_info.id !== state.your_info.id)
				.map((player) => ({
					id: player.your_info.id,
					name: player.your_info.name,
					avatar: player.your_info.avatar,
					cardCount: player.your_info.cardCount,
					type: player.your_info.type,
					connected: player.your_info.connected
				}));

			setOpponents(newOpponents);
		}
	}, [state?.players, state?.your_info.id]);

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
			if (!msg.is_connection_timer) {  // Don't auto-animate connection timers
				const element = document.getElementById(`status-${msg.id}`);
				if (element && !element.dataset.animated) {
					element.dataset.animated = 'true';

					// Remove after animation
					const duration = msg.is_play_announcement ? 6000 : 3000;
					setTimeout(() => {
						setStatusMessages(prev => prev.filter(m => m.id !== msg.id));
					}, duration);
				}
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
		socket.send(JSON.stringify({type: "bluff_called"}));
		setHasActed(true);
	};

	const addStatusMessage = (playerId, message, is_play_announcement = false, is_connection_timer = false) => {

		const playerElement = document.getElementById(`player-${playerId}`);
		if (playerElement) {
			// Add player to speaking set
			setSpeakingPlayers(prev => new Set(prev).add(playerId));

			// Not using playerPositions here because need fixed absolute positions at top of bounding box
			const position = {
      x: playerElement.offsetLeft,
      y: playerPositionsRef.current[playerId].angle === 90
        ? playerElement.offsetTop - 80 // push up for bottom player
        : playerElement.offsetTop
    };

			if (is_connection_timer) {
				// For connection timers, update existing message or create new one
				setStatusMessages(prev => {
					const existing = prev.find(m => m.playerId === playerId && m.is_connection_timer);
					if (existing) {
						// Update the existing timer message
						return prev.map(m => m.id === existing.id ? {...m, message} : m);
					} else {
						// Create new timer message
						return [...prev, {
							id: `timer-${playerId}`, // Stable ID for timers
							playerId, message, position, is_play_announcement: false, is_connection_timer: true
						}];
					}
				});
			} else {
				// Regular messages - create new and remove after timeout
				const newMessage = {
					id: Math.random(), playerId, message, position, is_play_announcement, is_connection_timer: false
				};

				setStatusMessages(prev => [...prev, newMessage]);

				// Remove after animation
				const duration = is_play_announcement ? 6000 : 3000;
				setTimeout(() => {
					setStatusMessages(prev => prev.filter(msg => msg.id !== newMessage.id));
					setSpeakingPlayers(prev => {
						const newSet = new Set(prev);
						newSet.delete(playerId);
						return newSet;
					});
				}, duration);
			}
		}
	};
	// Removes the connection timer message from a player
	const removeConnectionTimer = (playerId) => {
		setStatusMessages(prev => prev.filter(msg => !(msg.playerId === playerId && msg.is_connection_timer)));
		setSpeakingPlayers(prev => {
			const newSet = new Set(prev);
			newSet.delete(playerId);
			return newSet;
		});
	};

	const removeAllConnectionTimers = () => {
		setStatusMessages(prev => {
			const timers = prev.filter(msg => msg.is_connection_timer);

			// Remove those players from speaking set
			setSpeakingPlayers(speakingPrev => {
				const newSet = new Set(speakingPrev);
				timers.forEach(msg => {
					newSet.delete(msg.playerId);
				});
				return newSet;
			});

			// Return filtered messages
			return prev.filter(msg => !msg.is_connection_timer);
		});
	};

	// Human message: sends the message input by default
	const sendMessage = useCallback((customMessage = null) => {
		const messageToSend = customMessage || messageInput.trim();

		if (messageToSend && socket) {
			socket.send(JSON.stringify({
				type: "human_message", message: messageToSend, sender_id: state.your_info.id
			}));

			addStatusMessage(state.your_info.id, messageToSend);

			if (!customMessage) {
				setMessageInput(""); // Only clear if it was from the input
			}
		}
	}, [messageInput, socket, state?.your_info.id]);

	// Human click on opponent
	const handlePlayerClick = (opponent) => {
		if (!socket || gameOver) return;

		const cardText = opponent.cardCount === 1 ? "1 card" : `${opponent.cardCount} cards`;
		const message = `Woah, ${opponent.name} only has ${cardText} left!`;

		// Send to backend to broadcast
		socket.send(JSON.stringify({
			type: "human_message", message: message, sender_id: state.your_info.id
		}));
	};

	return (

		<div className="min-h-screen text-white flex flex-col p-6">

			{/* Game logo */}
			<div className="fixed inset-0 flex items-center justify-center pointer-events-none">
				<Logo className="opacity-20" style={{width: "20rem", height: "auto"}} animationDuration="0s"/>
			</div>

			{/* Game menu */}
			<GameMenu
				onQuit={() => {
					if (socket) {
						socket.send(JSON.stringify({type: "quit", player_id: state.your_info.id}));
					}
					onExitGame();
				}}
				highlightMenu={highlightMenu}
			/>

			{/* Game is over */}
			<GameOverOverlay
				gameOver={gameOver}
				winner={winner} f
				state={state}
				ws={socket}
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
				onQuit={() => {
					if (socket) {
						socket.send(JSON.stringify({type: "quit", player_id: state.your_info.id}));
					}
					onExitGame();
				}}
				countdown={countdown}
				confirmedCount={confirmedCount}
				totalHumans={totalHumans}
			/>

			{/* Status Message bubbles floating up from each player */}
			<StatusMessage statusMessages={statusMessages}/>

			{/* Section containing players and cards*/}
			<div className="flex-1 flex items-center justify-center relative">

				{/* Opponents arranged in semi-circle around pile */}
				<OpponentIcons
					opponents={opponents}
					playerPositions={playerPositionsRef.current}
					handlePlayerClick={handlePlayerClick}
					state={state}
					getPlayerColor={getPlayerColor}
				/>

				<CenterPile
					isMyTurn={isMyTurn}
					hasActed={hasActed}
					pileCards={pileCards}
					lastPlayedCount={lastPlayedCount}
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
					allowedMessages={predefinedMessages}
					declaredRank={declaredRank}
					parseCard={parseCard}
					toggleCard={toggleCard}
					setMessageInput={setMessageInput}
					playerPositions={playerPositionsRef.current}
					yourId={selfId}
					pileCards={pileCards}
					callBluff={callBluff}
				/>

				<CardFlyAnimation animatingCards={animatingCards}/>

				<PilePickUpAnimation pilePickupAnimation={pilePickupAnimation}/>

				<DiscardAnimation discards={discards}/>

			</div>
		</div>);
}