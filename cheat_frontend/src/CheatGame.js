import React, { useState, useEffect, useRef, useCallback} from "react";
import confetti from "canvas-confetti";
import { soundManager } from './sounds';
import WelcomePage from './WelcomePage';

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

	// Check whether it is human player's turn
	const [isMyTurn, setIsMyTurn] = useState(false);

	// New round
	const [isNewRound, setIsNewRound] = useState(true);

	// Track input error
	const VALID_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] // Aces cannot be declared!
	const [rankError, setRankError] = useState(false);

	// Track game over
	const [gameOver, setGameOver] = useState(false);
	const [winner, setWinner] = useState(null);

	// Animation states
	const [animatingCards, setAnimatingCards] = useState(null); // {playerId, cards, targetPosition, starting x, starting y}
	const [revealedCards, setRevealedCards] = useState(null); // {cards, wasLying}
	const [pileAnimation, setPileAnimation] = useState(null); // {text, type}
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
	const [showMessageInput, setShowMessageInput] = useState(false);

	// Allowed messages for experimental mode -- TODO: set this from config
	const allowedMessages = [
    "Taunt", "Surprise", "Shock", "Thinking", "Doubt", "Approval"
	];
	// Player colours
	const gradients = [
		'bg-gradient-to-br from-blue-500 to-purple-600',
		'bg-gradient-to-br from-red-500 to-pink-600',
		'bg-gradient-to-br from-green-500 to-teal-600',
		'bg-gradient-to-br from-yellow-500 to-orange-600',
		'bg-gradient-to-br from-purple-500 to-indigo-600'
	];

	const getPlayerColor = (playerId) => {
		return gradients[playerId % gradients.length];
	};

	const handleJoinGame = (playerName, avatar) => {

		console.log("handleJoinGame called with:", playerName, avatar)

		const socket = new WebSocket("ws://localhost:5050/ws");
		console.log("WebSocket created, connecting...");
		socket.onopen = () => {
			console.log("WebSocket connected");

			// Send player info immediately after connection
			socket.send(JSON.stringify({
				type: "player_join",
				name: playerName,
				avatar: avatar
			}));
		};

		socket.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			console.log("Received message:", msg);

			if (msg.type === 'new_game') {
				const { type, ...currentState } = msg;
				setState(currentState);
				setHasJoined(true);
				setExperimentalMode(msg.experimental_mode);
				if (msg.current_player === msg.your_id) {
					setHasActed(false);
				}
				setIsMyTurn(msg.current_player === msg.your_id);
			}

			if (["state", "state_update", "card_played", "bluff_called", "discard", "game_over", "bot_message"].includes(msg.type)) {
				setActionQueue((prev) => [...prev, msg]);
			}

			if (msg.type === "human_message") {

            // Calculate the start position of the animation
            const totalPlayers = msg.num_players;
            const angle = 90 + (360 / (totalPlayers)) * (msg.sender_id);
            const angleRad = (angle * Math.PI) / 180;
            const radius = 300;
            const x = Math.cos(angleRad) * radius;
            const y = Math.sin(angleRad) * radius;

						addStatusMessage(msg.sender_id, msg.message, {x, y});

		}

		};

		socket.onerror = (error) => {
			console.error("WebSocket error:", error);
		};

		setWs(socket);
	};

	// Action queue: queued actions waiting while frontend animations play
	const [actionQueue, setActionQueue] = useState([]);


	// Helper function to visualise cards
	const parseCard = (cardStr) => {
		// Extract rank and suit from string
		const rank = cardStr.slice(0, -1);
		const suit = cardStr.slice(-1);

		// Determine color based on suit
		const isRed = suit === '♥' || suit === '♦';

		return { rank, suit, isRed };
	};

	// Add a ref to track if we're currently processing an action (if so, new ones are put on hold).
	const processingRef = useRef(false);

	// Process actions sequentially, and hold actions until animations have finished playing for a smoother
	// game play
    const processActionQueue = async () => {

		if (processingRef.current || animatingCards) return;

		// Get the first action
		const msg = actionQueue[0];

		// Pause play if the relevant player is currently speaking
		if (["card_played", "bluff_called", "bot_message", "discard"].includes(msg.type)){
				if (msg && (msg.current_player || msg.sender_id || msg.caller)) {
						const playerId = msg.sender_id || msg.caller || msg.current_player;
						if (playerId && speakingPlayers.has(playerId)) {
								return;
						}
				}
		}

		// Currently processing an action
		processingRef.current = true;

		if (msg.type === "state") {

				// Unpack
				const { type, ...currentState } = msg;

			  // Get the previous state
				const prevState = prevStateRef.current;

				// First, sync declaredRank with backend so that the declared rank always matches
				// what people are currently playing. If this is NULL, it means a new round has started and a new
				// rank can be declared.
				if (msg.current_rank !== null) {
						setDeclaredRank(msg.current_rank);
				} else if (prevState?.your_id === msg.current_player) {
						setDeclaredRank("");
				}

				prevStateRef.current = currentState;
				setState(currentState);

				// Only reset hasActed when it becomes your turn
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

			// Calculate the start position of the animation
			const totalPlayers = msg.num_players;
			const angle = 90 + (360 / (totalPlayers)) * (msg.current_player);
			const angleRad = (angle * Math.PI) / 180;
			const radius = 300;
			const x = Math.cos(angleRad) * radius;
			const y = Math.sin(angleRad) * radius;

			// Generate final positions for each card BEFORE animating
			const newCards = Array(msg.card_count)
					.fill(0)
					.map((_, i) => ({
						id: Math.random(),
						rotation: Math.random() * 60 - 30, // -30 to +30 degrees
						offsetX: Math.random() * 100 - 50,  // -50 to +50 px
						offsetY: Math.random() * 100 - 50,
						startRotation: -(5 + (i * 5))  // Starting rotation from hand
			}));

			// Animate cards moving to pile
			soundManager.play('cardPlay');
			setAnimatingCards({
				playerId: msg.current_player,
				cardCount: msg.card_count,
				declaredRank: msg.declared_rank,
				x,
				y,
				cards: newCards  // Pass the final positions
			});

			// Show pile animation text
			setPileAnimation({
				text: `+${msg.card_count}`,
				type: 'play'
			});

			// Add status message
			const rankText = msg.declared_rank === "A" ? "Ace" :
											 msg.declared_rank === "K" ? "King" :
											 msg.declared_rank === "Q" ? "Queen" :
											 msg.declared_rank === "J" ? "Jack" : msg.declared_rank;

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
			setPileAnimation(null);

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

			// Determine who picks up the pile
			const pickupPlayerId = msg.was_lying ? msg.accused : msg.caller;
			// TODO only do this once!
			// Calculate target position using your existing method
			const totalPlayers = msg.num_players;
			const angle = 90 + (360 / totalPlayers) * pickupPlayerId;
			const angleRad = (angle * Math.PI) / 180;
			const radius = 300;
			const targetX = Math.cos(angleRad) * radius;
			const targetY = Math.sin(angleRad) * radius;

			// Start pile pickup animation
			if (pileCards.length > 0) {
				  soundManager.play('pick_up');
					setPilePickupAnimation({
							playerId: pickupPlayerId,
						  targetX,
              targetY,
							cards: [...pileCards] // Copy current pile cards
					});

					setPileCards([]);

					// Wait for pickup animation
					await new Promise(r => setTimeout(r, 1000));
					setPilePickupAnimation(null);
			}

			setRevealedCards(null);
			setPileAnimation(null);
			setLastPlayedCount(0);

		// Cards have been discarded: set a message
		} else if (msg.type === "discard") {

			// Parse: "Player 2 discards 7, K, A."
			const match = msg.result.match(/Player (\d+) discards (.+)\./);
			if (match) {
					const playerId = parseInt(match[1]);
					const ranksStr = match[2]; // "7, K, A"
					const ranks = ranksStr.split(', '); // ["7", "K", "A"]

					// Calculate player position for animation
					const totalPlayers = state.num_players;
					const angle = 90 + (360 / totalPlayers) * playerId;
					const angleRad = (angle * Math.PI) / 180;
					const radius = 300;
					const x = Math.cos(angleRad) * radius;
					const y = Math.sin(angleRad) * radius;

					// Show animation
					soundManager.play('discard');

					// Add to status messages instead of separate discardAnimation
					const message = playerId === state.your_id
							? `You discard ${ranksStr}s`
							: `Discarding ${ranksStr}s`;
					addStatusMessage(playerId, message, {x, y});

					// Add all ranks to discard list
					setDiscards(prev => [...prev, ...ranks]);

					// Wait for animation
					await new Promise(r => setTimeout(r, 1500));
					setDiscardAnimation(null);
			}

		// Opinion status sent
		} else if (msg.type === "bot_message") {

            // Calculate the start position of the animation
            const totalPlayers = msg.num_players;
            const angle = 90 + (360 / (totalPlayers)) * (msg.sender_id);
            const angleRad = (angle * Math.PI) / 180;
            const radius = 300;
            const x = Math.cos(angleRad) * radius;
            const y = Math.sin(angleRad) * radius;

						addStatusMessage(msg.sender_id, msg.message, {x, y});

        // Game is over
		} else if (msg.type === "game_over") {

			setWinner(msg.winner);
			setGameOver(true);

			soundManager.play('win');
			// 🎉 Trigger confetti burst
			confetti({
						particleCount: 200,
						spread: 100,
						origin: { y: 0.6 },
			});
		}

		// remove the processed action
		setActionQueue((prev) => prev.slice(1));
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

        if (!isMyTurn || selectedCards.length === 0 || selectedCards.length > 3){
            // setShowRankInput(false);
            return;
        }

        // Only require declared rank for new rounds
        if (isNewRound && !declaredRank){
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

        ws.send(
					JSON.stringify({
							type: "play",
							declared_rank: declaredRank,
							cards: selectedCards,
					})
        );

        // Optimistically update your hand immediately
        setState(prevState => ({
            ...prevState,
            your_hand: prevState.your_hand.filter(card => !selectedCards.includes(card))
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
			const newSelection = sel.includes(card)
				? sel.filter((c) => c !== card)
				: [...sel, card];
			// Limit to 3 cards
			return newSelection.length <= 3 ? newSelection : sel;
		});
	};

	const callBluff = () => {
		ws.send(JSON.stringify({ type: "call" }));
		setHasActed(true);
	};

	const addStatusMessage = (playerId, message) => {

		const playerElement = document.getElementById(`player-${playerId}`);
		if (playerElement) {
			// Add player to speaking set
			setSpeakingPlayers(prev => new Set(prev).add(playerId));
			const rect = playerElement.getBoundingClientRect();
			const position = {
				x: rect.left + rect.width / 2,
				y: rect.top
			};

			const newMessage = {
				id: Math.random(),
				playerId,
				message,
				position
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
							type: "human_message",
							message: messageToSend,
							sender_id: state.your_id
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
        type: "human_message",
        message: message
    }));

    // Show immediately for the clicker
    addStatusMessage(state.your_id, message);
};

	if (!hasJoined) {
    return <WelcomePage onJoinGame={handleJoinGame} />;
  }

  if (!state) {
    return <div>Loading game...</div>;
  }

	return (

	<div className="min-h-screen text-white flex flex-col p-6">

	    {/* Game logo */}
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-white opacity-5 text-9xl satisfy-regular">Cheat!</div>
        </div>

        {/* Game over */}
        {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-white text-7xl font-bold z-50">
                <div className="mb-6 satisfy-regular">
                    {winner === state.your_name
                        ? "🎉 You win! 🎉"
                        : `${winner} wins!`}
                </div>
                <button
                    onClick={() => {
                        ws.send(JSON.stringify({ type: "new_game" }));
                        setGameOver(false);
                        setWinner(null);
                        setSelectedCards([]);     // clear any lingering selections
                        setDeclaredRank("");      // reset the rank box
                        setHasActed(false);       // reset action flag
                        setPileCards([]);
                        setActionQueue([]);
                        setIsNewRound(true);
                        setIsMyTurn(true);
                        setDiscards([]);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl text-lg"
                >
                    New Game
                </button>
            </div>
        )}

		    {/* Status messages as floating bubbles from players */}
        {statusMessages.map(msg => (
          <div
            key={msg.id}
            id={`status-${msg.id}`}
            className="absolute pointer-events-none z-50 backdrop-blur bg-amber-50 bg-opacity-20 rounded-3xl p-3 drop-shadow-lg"
            style={{
              left: `${msg.position.x}px`,
              top: `${msg.position.y}px`,
            }}
          >
            <div className="text-white text-lg font-semibold whitespace-nowrap">
              {msg.message}
            </div>
          </div>
        ))}

        {/* Center Pile Section with Opponents */}
        <div className="flex-1 flex items-center justify-center relative">
            {/* Opponents arranged in semi-circle around pile */}
            {opponents.map((opp, index) => {
                const totalOpponents = opponents.length;

                // Calculate angle for each opponent (evenly spread around pile)
							  // TODO: do this once at the start
                const angle = 90 + (360 / (totalOpponents + 1)) * (index + 1);
                const angleRad = (angle * Math.PI) / 180;
                const radius = 300; // Distance from pile center

                // Calculate position from center (pile position)
                const x = Math.cos(angleRad) * radius;
                const y = Math.sin(angleRad) * radius;

                return (
                    <div
                        key={opp.id}
												id={`player-${opp.id}`}
                        style={{
                            position: 'absolute',
                            left: `calc(50% + ${x}px)`,
                            top: `calc(50% + ${y}px)`,
                            transform: 'translate(-50%, -50%)',
                        }}
                        className={`player-opponent rounded-full z-10 p-4 w-24 h-24 border-2 ${getPlayerColor(opp.id)} ${
                            state.current_player === opp.id
                                ? "border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.9)]"
                                : ""
                        } cursor-pointer transition-all duration-200 group`}
												onClick={() => handlePlayerClick(opp)}
                    >
											<div className="text-center flex flex-col items-center justify-center h-full relative">
												{/* Curved player name */}
												<svg width="200" height="100" viewBox="0 0 200 80" className="absolute left-1/2 -top-12 transform -translate-x-1/2">
													<defs>
														{/* Move arc higher to accommodate larger text */}
														<path id={`nameArc-${opp.id}`} d="M 40,60 A 25,20 0 1,1 160,60" fill="transparent"/>
													</defs>
													<text className="text-lg fill-white font-semibold">
														<textPath href={`#nameArc-${opp.id}`} startOffset="50%" textAnchor="middle">
															{opp.name.length > 15 ? `${opp.name.substring(0, 15)}...` : opp.name}
														</textPath>
													</text>
												</svg>
											{/* Avatar in center */}
											<span className="text-5xl z-10 relative group-hover:scale-110 transition-all">{opp.avatar}</span>
										</div>

                        {/* Card icons for each opponent */}
                        <div
                            key={`debug-card-${opp.id}0`}
                            className="opponent-card-1 absolute drop-shadow-xl z-10 w-12 h-16 bg-blue-800 border-0 border-white
                            rounded shadow-lg text-xs flex items-center justify-center transition-all"
                            style={{transform: 'translate(-10%, -2%) rotate(-6deg)'}}
                        ></div>
                        <div
                            key={`debug-card-${opp.id}1`}
                            className="opponent-card-2 transition-all absolute drop-shadow-xl z-20 w-12 h-16 bg-blue-700 border-0 border-white rounded shadow-lg text-xs flex items-center justify-center"
                            style={{
                                transform: 'translate(10%, -3%) rotate(-3deg)',
                            }}
                        ></div>
                        {/* Display number of cards on each hand */}
                        <div
                            key={`debug-card-${opp.id}2`}
                            className="opponent-card-3 transition-all absolute drop-shadow-xl z-30 w-12 h-16 bg-blue-600 border-0 border-white rounded shadow-lg text-xs flex items-center justify-center"
                            style={{
                                transform: 'translate(30%, -4%)',
                            }}
                        >
                            <div className="text-center flex flex-col items-center justify-center h-full">
                                <div className="text-2xl font-bold">{opp.cardCount}</div>
                                <div className="text-xs opacity-75">cards</div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Pile in center */}
            <div className="fixed left-1/2 top-1/2 z-20" style={{ transform: "translate(-50%, -50%)"}}>
                {/*<div className="text-center">*/}
                {/*    {declaredRank && !isNewRound && (*/}
                {/*        <div className="p-4 w-28 h-28 drop-shadow-lg absolute" style={{ left: '-120px', top: '-120px' }}>*/}
                {/*            <div className="text-lg opacity-75 z-50">Playing</div>*/}
                {/*            <div className="text-6xl font-bold text-yellow-400">{declaredRank || "—"}</div>*/}
                {/*        </div>)}*/}

                {/*        <div className="absolute" style={{ left: '120px', top: '120px' }}>*/}
                {/*            {pileCards.length > 0 && (*/}
                {/*                    <>*/}
                {/*                        <div className="text-lg opacity-75">Pile</div>*/}
                {/*                        <div className="text-5xl font-bold opacity-75">{pileCards.length}</div>*/}
                {/*                    </>*/}
                {/*            )}*/}
                {/*            /!* Pile animation popup *!/*/}
                {/*            {pileAnimation && (*/}
                {/*                <div*/}
                {/*                    className={`absolute z-40 pointer-events-none text-5xl font-bold`}*/}
                {/*                    style={{*/}
                {/*                        left: '40px',*/}
                {/*                        top: '50px',*/}
                {/*                        transform: 'translate(-20%, 50%)',*/}
                {/*                        animation: 'popUp 1.5s ease-out',*/}
                {/*                        textShadow: '0 0 10px rgba(0,0,0,1)'*/}
                {/*                    }}*/}
                {/*                >*/}
                {/*                    {pileAnimation.text}*/}
                {/*                </div>*/}
                {/*            )}*/}
                {/*        </div>*/}
                {/*</div>*/}

                {/* Call Bluff Button */}
                {isMyTurn && state.pile_size > 0 && state.current_rank && !hasActed && (
                    <div className="absolute top-full mt-20 left-1/2 pop-in" style={{ transform: 'translateX(-50%)' }}>
                        <button
                            onClick={callBluff}
                            className="w-full drop-shadow-[0_0px_40px_rgba(0,0,0,1)] bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6
                            rounded-lg transition-colors"
                        >
                            Call!
                        </button>
                    </div>
                )}
            </div>

            {/* Cards on pile */}
            <div className="absolute left-1/2 top-1/2 z-10" style={{ transform: "translate(-50%, -50%)" }}>
                {pileCards.map((card, index) => {
                    const isRecentlyPlayed = index >= pileCards.length - lastPlayedCount && isMyTurn && !hasActed;
                    return (
                      <div
                        key={card.id}
                        className={`absolute w-12 h-16 rounded bg-blue-600 border-2 shadow-lg transition-all ${
                          isRecentlyPlayed ? 'border-red-500 border-4 shadow-red-500/50' : 'border-white'
                        }`}
                        style={{
                          transform: `translate(${card.offsetX}px, ${card.offsetY}px) rotate(${card.rotation}deg)`,
                        }}
                      />
                );
              })}
            </div>

            {/* Revealed cards panel - non-overlay */}
{revealedCards && (
  <div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40">
    <div className="text-center bg-opacity-80 backdrop-blur-sm rounded-2xl p-8 border-2 border-white border-opacity-20 shadow-2xl">
      {/* Dramatic result text */}
      <div
        className="text-5xl font-bold mb-4 satisfy-regular"
        style={{
          animation: 'dramaticZoom 0.8s ease-out',
          color: revealedCards.wasLying ? '#ef4444' : '#9BE9B7',
          textShadow: revealedCards.wasLying
            ? '0 0 50px #ef4444'
            : '0 0 50px rgba(34, 197, 94, 0.8)'
        }}
      >
        {revealedCards.wasLying ? '🎭 Busted!' : "No lies detected!"}
      </div>

      {/* Player info */}
      <div className="text-2xl mb-6 text-white drop-shadow-lg">
        {revealedCards.wasLying ? (
          <p className="mb-2">
            {revealedCards.accused === state.your_id ? "You" : `${revealedCards.accused_name}`} played:
          </p>
        ) : (
          <p className="mb-2">
            {revealedCards.caller === state.your_id ? "You pick" : `${revealedCards.caller_name} picks`} up the pile.
          </p>
        )}
      </div>

      {/* Cards - only show if they were lying */}
      {revealedCards.wasLying && (
        <div className="flex justify-center gap-6 perspective-1000">
          {revealedCards.cards.map((card, i) => {
            const { rank, suit, isRed } = parseCard(card);
            return (
              <div
                key={i}
                className="relative"
                style={{
                  animation: `cardFlipReveal 1s ease-out ${i * 0.15}s both`
                }}
              >
                {/* Card back (shows first during flip) */}
                <div
                  className="absolute inset-0 w-20 h-28 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg border-4 border-white shadow-2xl"
                  style={{
                    backfaceVisibility: 'hidden',
                    animation: `cardFlipOut 1s ease-out ${i * 0.15}s both`
                  }}
                >
                  <div className="absolute inset-2 border-2 border-blue-400 rounded"></div>
                </div>

                {/* Card front (reveals after flip) */}
                <div
                  className="w-20 h-28 bg-white rounded-lg border-4 border-red-400 shadow-2xl relative"
                  style={{
                    backfaceVisibility: 'hidden',
                    animation: `cardFlipIn 1s ease-out ${i * 0.15}s both`
                  }}
                >
                  {/* Top-left corner */}
                  <div className={`absolute top-1 left-2 text-sm leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                    <div className="font-bold text-lg">{rank}{suit}</div>
                  </div>

                  {/* Center suit */}
                  <div className={`absolute inset-0 flex items-center justify-center text-5xl ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                    {suit}
                  </div>

                  {/* Bottom-right corner */}
                  <div className={`absolute bottom-1 right-2 text-sm leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                    <div className="font-bold text-lg">{rank}{suit}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
)}

            {/* My Hand Section */}
            <div
            style={{
                position: 'fixed',
                left: '50%',
                bottom: '20px',
                transform: 'translateX(-50%)',
            }}
            className="z-10"
					  id="player-0"
            >
                <div className="flex justify-center">
                    <div className="rounded-xl p-4">
                        <div className="text-center mb-3">
                            <div className="text-lg font-semibold">
                                {isMyTurn && (
                                    <span className="ml-3 text-yellow-400">Your Turn</span>
                                )}
                                {selectedCards.length > 0 && (
                                    <span className="ml-3 text-gray-500 font-medium text-sm">Selected: {selectedCards.join(", ")}</span>
                                )}
                            </div>
                        </div>

                        {/* Cards */}
                        <div className="flex justify-center items-end mb-4" style={{ paddingLeft: '2rem', paddingRight: '2rem' }}>
                            {state.your_hand.map((card, index) => {
                                const { rank, suit, isRed } = parseCard(card);
                                return (
                                    <button
                                        key={`${card}-${index}`}
                                        onClick={() => toggleCard(card)}
                                        disabled={!isMyTurn || hasActed || (selectedCards.length >= 3 && !selectedCards.includes(card))}
                                        style={{ marginLeft: index === 0 ? '0' : '-1.5rem'}}
                                        className={`relative w-16 h-24 rounded-lg border-2 transition-all font-bold ${
                                            selectedCards.includes(card)
                                                ? "bg-yellow-400 border-yellow-500 transform -translate-y-4 shadow-xl"
                                                : "bg-white border-gray-400 shadow-md"
                                        } ${
                                            isMyTurn && !hasActed && (selectedCards.length < 3 || selectedCards.includes(card))
                                                ? "hover:shadow-lg hover:-translate-y-2 cursor-pointer"
                                                : !isMyTurn || hasActed
                                                    ? "cursor-not-allowed"
                                                    : "bg-gray-400 cursor-not-allowed"
                                        }`}
                                    >
                                        {/* Top-left corner */}
                                        <div className={`absolute top-1 left-1.5 text-sm leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                            <div>{rank}</div>
                                            <div className="text-base">{suit}</div>
                                        </div>

                                        {/* Center suit */}
                                        <div className={`absolute inset-0 flex items-center justify-center text-3xl ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                            {suit}
                                        </div>

                                        {/* Bottom-right corner (upside down) */}
                                        <div className={`absolute bottom-1 right-1.5 text-sm leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                            <div>{rank}</div>
                                            <div className="text-base">{suit}</div>
                                        </div>
                                    </button>
                                );
                            })}
                    </div>

{/* Play Controls / Message Input with Morphing Effect */}
<div className={`
    relative flex items-center justify-center gap-4 
    transition-all duration-500 ease-in-out
    ${isMyTurn && !hasActed ? 'h-12 scale-100' : 'h-12 scale-95'}
`}>
    {/* Background bubble that morphs */}
    <div className={`
        absolute inset-0 rounded-2xl backdrop-blur-sm bg-opacity-20
        transition-all duration-500 ease-in-out
        ${isMyTurn && !hasActed 
            ? 'scale-100' 
            : 'scale-105'
        }
    `}></div>

    {/* Content */}
    <div className="relative z-10 flex items-center gap-4 transition-all duration-300">
        {isMyTurn && !hasActed ? (
            // Play Controls
            <div className="flex items-center gap-4 animate-fadeIn">
                {showRankInput && (
                    <input
                        type="text"
                        placeholder="Rank (e.g. 7)"
                        value={declaredRank}
                        onChange={(e) => {
													setDeclaredRank(e.target.value.toUpperCase())
												}}
                        onKeyDown={(e) => {
														if (e.key === 'Enter') {
																e.preventDefault();
																console.log("Selected Cards length", selectedCards.length);
																// Only play if cards are actually selected AND rank is valid
																if (selectedCards.length > 0) {
																		play();
																} else {
																		// Optional: Show some feedback that cards need to be selected
																		console.log("Cannot play - no cards selected");
																}
														}
												}}
                        className={`
                            px-4 py-2 rounded-xl border-2 bg-blue-900 text-white text-center font-bold
                            w-40 transition-all duration-300 transform
                            ${rankError 
                                ? 'animate-wiggle border-red-500 bg-red-500 scale-105' 
                                : 'border-blue-400 hover:border-blue-300 hover:scale-105'
                            }
                        `}
                    />
                )}
                <button
                    onClick={play}
                    disabled={
                        selectedCards.length === 0 ||
                        selectedCards.length > 3 ||
                        (isNewRound && !declaredRank)
                    }
                    className={`
                        px-6 py-2 rounded-xl font-bold text-white transition-all duration-300 transform
                        ${selectedCards.length === 0 || (isNewRound && !declaredRank)
                            ? 'bg-gray-600 cursor-not-allowed scale-95'
                            : 'bg-green-600 hover:bg-green-500 hover:scale-105 active:scale-95 shadow-lg'
                        }
                    `}
                >
                    Play {selectedCards.length} Card{selectedCards.length !== 1 ? "s" : ""}
                </button>
            </div>
        ) : !experimentalMode ? (
            // Message Input
            <div className="flex items-center gap-3 animate-fadeIn">
                <input
                    type="text"
                    placeholder="Send a message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    className="px-4 py-1 rounded-xl backdrop-blur-lg opacity-50 text-gray-950 text-center font-medium text-lg w-64
                    transition-all duration-300 hover:scale-105 focus:scale-105"
                />
                <button
                    onClick={sendMessage}
                    disabled={!messageInput.trim()}
                    className={`
                        px-4 py-2 rounded-xl font-bold text-white transition-all duration-300 transform
                        ${!messageInput.trim()
                            ? 'bg-gray-600 cursor-not-allowed scale-95'
                            : 'bg-green-600 hover:bg-green-500 hover:scale-105 active:scale-95 shadow-lg'
                        }
                    `}
                >
                    Send
                </button>
            </div>
        ) : (
					// Experimental mode: Predefined message bubbles
    <div className="flex flex-col gap-1">
        <div className="flex gap-2">
            {allowedMessages.slice(0, 6).map((msg, index) => (
                <button
                    key={index}
                    onClick={() => sendMessage(msg)}
                    className="px-2 py-1 rounded-full bg-amber-50 hover:bg-white backdrop-blur-lg opacity-50
                    text-gray-950 font-semibold text-sm transition-all duration-300 hover:opacity-75 hover:scale-110 active:scale-95 whitespace-nowrap"
                >
                    {msg}
                </button>
            ))}
        </div>
        <div className="flex gap-1">
            {allowedMessages.slice(6, 10).map((msg, index) => (
                <button
                    key={index + 6}
                    onClick={() => sendMessage(msg)}
                    className="px-2 py-1 rounded-full bg-amber-50 hover:bg-white backdrop-blur-lg opacity-50 text-gray-950 font-semibold
                    text-sm transition-all duration-200 hover:scale-110 active:scale-95 whitespace-nowrap"
                >
                    {msg}
                </button>
            ))}
        </div>
    </div>
				)
				}
    </div>
</div>

                    </div>
                </div>
        </div>

        {/* Animation of cards flying to pile */}
        {animatingCards && (
            <div className="absolute z-20 pointer-events-none" style={{ left: '50%', top: '50%' }}>
            {animatingCards.cards.map((card, i) => (
                <div
                    key={i}
                    className="absolute w-12 h-16 bg-blue-600 rounded border-2 border-white shadow-lg"
                    style={{
                      animation: `cardFlyIndividual 0.6s ease-out forwards`,
                      animationDelay: `${i * 0.05}s`,
                      '--start-x': `${animatingCards.x}px`,
                      '--start-y': `${animatingCards.y}px`,
                      '--start-rotation': `${card.startRotation}deg`,
                      '--end-x': `${card.offsetX}px`,
                      '--end-y': `${card.offsetY}px`,
                      '--end-rotation': `${card.rotation}deg`
                    }}
                />
            ))}
            </div>
        )}

				{/* Pile pickup animation - cards flying to player's hand */}
				{pilePickupAnimation && (
						<div className="absolute z-0 pointer-events-none" style={{ left: '50%', top: '50%', zIndex: 0 }}>
								{pilePickupAnimation.cards.map((card, i) => (
										<div
												key={`pickup-${card.id}`}
												className="absolute w-12 h-16 z-0 bg-blue-600 rounded border-2 border-white shadow-lg"
												style={{
														animation: `cardPickup 0.5s ease-out forwards`,
														animationDelay: `${i * 0.05}s`,
														'--start-x': `${card.offsetX}px`,
														'--start-y': `${card.offsetY}px`,
														'--start-rotation': `${card.rotation}deg`,
														'--target-x': `${pilePickupAnimation.targetX}px`,
														'--target-y': `${pilePickupAnimation.targetY}px`
												}}
										/>
								))}
						</div>
				)}

        {/* Discard tracker - top left corner */}
        {discards.length > 0 && (
            <div className="fixed top-4 left-4 rounded-lg p-4 z-0 max-w-md">
                <div className="text-sm font-bold mb-3 opacity-75">Discarded Sets:</div>
                    <div className="flex flex-wrap gap-3">
                    {discards.map((rank, setIndex) => (
                    <div
                      key={setIndex}
                      className="relative"
                      style={{
                        animation: 'popIn_cards 0.5s ease-out'
                      }}
                    >
                      {/* Show 4 overlapping cards for each set */}
                      <div className="relative h-20" style={{ width: '60px', marginRight: '20px'}}>
                        {['♠', '♥', '♣', '♦'].map((suit, cardIndex) => {
                          const isRed = suit === '♥' || suit === '♦';
                          return (
                            <div
                              key={cardIndex}
                              className="absolute w-12 h-16 bg-gray-200 drop-shadow-xl rounded border border-gray-300 shadow-md"
                              style={{
                                left: `${cardIndex * 10}px`,
                                top: 0,
                                zIndex: cardIndex,
                                animation: `cardPop 0.3s ease-out ${cardIndex * 0.1}s both`
                              }}
                            >
                              {/* Top-left corner */}
                              <div className={`absolute top-0.5 left-1 text-xs leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                <div className="font-bold">{rank}</div>
                                <div className="text-sm">{suit}</div>
                              </div>

                              {/* Center suit */}
                              <div className={`absolute inset-0 flex items-center justify-center text-xl ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                {suit}
                              </div>

                              {/* Bottom-right corner */}
                              <div className={`absolute bottom-0.5 right-1 text-xs leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                <div className="font-bold">{rank}</div>
                                <div className="text-sm">{suit}</div>
                              </div>
                            </div>
                          );
                        })}

                      </div>
                    </div>
                    ))}
                </div>
            </div>
        )}
        </div>
	</div>
	);
}