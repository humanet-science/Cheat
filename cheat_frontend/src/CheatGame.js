import React, { useState, useEffect, useRef, useCallback} from "react";
import confetti from "canvas-confetti";

export default function CheatGame() {

	const [ws, setWs] = useState(null);
	const [state, setState] = useState(null);
	const [selectedCards, setSelectedCards] = useState([]);
	const [declaredRank, setDeclaredRank] = useState("");
	const [message, setMessage] = useState(""); // Collect messages
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

	// Cards on the pile
	const [pileCards, setPileCards] = useState([]);

    // Number of cards played in last hand, so that we can highlight them when it's time to call a bluff
    const [lastPlayedCount, setLastPlayedCount] = useState(0);

    // Discarded ranks
    const [discards, setDiscards] = useState([]); // Track all discarded ranks
    const [discardAnimation, setDiscardAnimation] = useState(null); // {playerId, rank}

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

		processingRef.current = true;

		// Get the first action
		const msg = actionQueue[0];

		if (msg.type === "state" || msg.type === "state_update") {

			  // Get the previous state
				const prevState = prevStateRef.current;

				// First, sync declaredRank with backend so that the declared rank always matches
				// what people are currently playing. If this is NULL, it means a new round has started and a new
				// rank can be declared.
				if (msg.state.currentRank !== null) {
						setDeclaredRank(msg.state.currentRank);
				} else if (prevState?.yourId === msg.state.currentPlayer) {
						setDeclaredRank("");
				}

				prevStateRef.current = msg.state;
				setState(msg.state);

				// Only reset hasActed when it becomes YOUR turn
				if (msg.state.currentPlayer === msg.state.yourId) {
					setHasActed(false);
				}
				setIsMyTurn(msg.state.currentPlayer === msg.state.yourId);

				// Small delay to let state update
    		await new Promise(r => setTimeout(r, 100));

		} else if (msg.type === "card_played") {

			if (msg.declared_rank !== null) {
				setDeclaredRank(msg.declared_rank);
			}
			setIsMyTurn(Boolean(msg?.player_id && msg?.yourId && msg.player_id === msg.yourId));

			// Calculate the start position of the animation
			const totalPlayers = msg.num_players;
			const angle = 90 + (360 / (totalPlayers)) * (msg.player_id);
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
			setAnimatingCards({
				playerId: msg.player_id,
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

			setIsMyTurn(Boolean(msg?.player_id && msg?.yourId && msg.player_id === msg.yourId));

			// Show revealed cards
			setRevealedCards({
				cards: msg.actual_cards,
				wasLying: msg.was_lying,
				declaredRank: msg.declared_rank,
				caller: msg.caller_id,
				accused: msg.accused_id
			});

			// Clear after showing cards
			await new Promise(r => setTimeout(r, 3000)); // wait before clearing
			setRevealedCards(null);
			setPileAnimation(null);
			setPileCards([]);
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
                const totalPlayers = state.hands.length;
                const angle = 90 + (360 / totalPlayers) * playerId;
                const angleRad = (angle * Math.PI) / 180;
                const radius = 300;
                const x = Math.cos(angleRad) * radius;
                const y = Math.sin(angleRad) * radius;

                // Show animation
                setDiscardAnimation({
                  playerId,
                  ranks,
                  x,
                  y,
                  message: playerId === state.yourId
                    ? `You discard ${ranksStr}!`
                    : `Discards ${ranksStr}!`
                });

                // Add all ranks to discard list
                setDiscards(prev => [...prev, ...ranks]);

                // Wait for animation
                await new Promise(r => setTimeout(r, 1500));
                setDiscardAnimation(null);
            }
        // Game is over
		} else if (msg.type === "game_over") {

             setWinner(msg.winner);
             setGameOver(true);
             setMessage(`Game Over! Player ${msg.winner} wins!`);

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
    }, [actionQueue, animatingCards]);

	useEffect(() => {

		const socket = new WebSocket("ws://localhost:5050/ws");

		socket.onmessage = async (event) => {

			const msg = JSON.parse(event.data);
			console.log("Received message:", msg);

			// Add actions to action queue for card playing or bluffs being called.
			// This way animations play in succession and game play is paused until the animations are done
            if (["state", "state_update", "card_played", "bluff_called", "discard", "game_over"].includes(msg.type)) {

                setActionQueue((prev) => [...prev, msg]);

            }
		};

		socket.onopen = () => {
			console.log("WebSocket connected");
		};

		socket.onerror = (error) => {
			console.error("WebSocket error:", error);
		};

		setWs(socket);
		return () => socket.close();
	}, []);

	// Checks whether the rank needs to be declared; if not, the text box disappears.
	// Also validates the rank, so that only valid ranks are sent to the backend.
	const play = useCallback(() => {

        setIsNewRound(declaredRank === null || declaredRank === "");

        if (!isMyTurn || selectedCards.length === 0 || selectedCards.length > 3){
            setShowRankInput(false);
            return;
        }

        // Only require declared rank for new rounds
        if (isNewRound && !declaredRank){
            setShowRankInput(false);
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
            yourHand: prevState.yourHand.filter(card => !selectedCards.includes(card))
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

		setIsNewRound(!declaredRank); // "" or null both mean new round

		if (isMyTurn && isNewRound) {
			setShowRankInput(true);
		} else {
			setShowRankInput(false);
		}
	}, [state]);

	useEffect(() => {
		if (!state) return;
		if (state.hands && state.yourId !== undefined) {
			const newOpponents = state.hands
				.map((cardCount, index) => ({
					id: index,
					cardCount: cardCount,
				}))
				.filter((player) => player.id !== state.yourId);

			setOpponents(newOpponents);
		}
	}, [state?.hands, state?.yourId]); // React to changes in both

	if (!state) {
        return (
            <div className="min-h-screen bg-blue-950 flex items-center justify-center text-white text-xl">
                Loading game...
            </div>
        );
	}

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
		console.log("Calling bluff");
		ws.send(JSON.stringify({ type: "call" }));
		setHasActed(true);
	};


	return (

	<div className="min-h-screen text-white flex flex-col p-6">

	    {/* Game logo */}
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-white opacity-5 text-9xl satisfy-regular">Cheat!</div>
        </div>

        {/* Game over */}
        {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-white satisfy-regular text-5xl font-bold z-50">
                <div className="mb-6">
                    {winner === state.yourId
                        ? "🎉 You win! 🎉"
                        : `🎉 Player ${winner} wins! 🎉`}
                </div>
                <button
                    onClick={() => {
                        ws.send(JSON.stringify({ type: "new_game" }));
                        setGameOver(false);
                        setWinner(null);
                        setMessage("");
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

        {/* Center Pile Section with Opponents */}
        <div className="flex-1 flex items-center justify-center relative">
            {/* Opponents arranged in semi-circle around pile */}
            {opponents.map((opp, index) => {
                const totalOpponents = opponents.length;

                // Calculate angle for each opponent (evenly spread around pile)
                const angle = 90 + (360 / (totalOpponents + 1)) * (index + 1);
                const angleRad = (angle * Math.PI) / 180;
                const radius = 300; // Distance from pile center

                // Calculate position from center (pile position)
                const x = Math.cos(angleRad) * radius;
                const y = Math.sin(angleRad) * radius;

                return (
                    <div
                        key={opp.id}
                        style={{
                            position: 'absolute',
                            left: `calc(50% + ${x}px)`,
                            top: `calc(50% + ${y}px)`,
                            transform: 'translate(-50%, -50%)'
                        }}
                        className={`bg-green-900 rounded-full p-4 w-24 h-24 border-2 ${
                            state.currentPlayer === opp.id
                                ? "border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.9)]"
                                : ""
                        }`}
                    >
                        <div className="text-center flex flex-col items-center justify-center h-full">
                            <div className="text-m opacity-75">Player {opp.id}</div>
                        </div>
                        {/* Card icons for each opponent */}
                        <div
                            key={`debug-card-${opp.id}0`}
                            className="absolute drop-shadow-xl z-10 w-12 h-16 bg-blue-800 border-2 border-white rounded shadow-lg text-xs flex items-center justify-center"
                            style={{transform: 'translate(-10%, -20%) rotate(-6deg)'}}
                        ></div>
                        <div
                            key={`debug-card-${opp.id}1`}
                            className="absolute drop-shadow-xl z-20 w-12 h-16 bg-blue-700 border-2 border-white rounded shadow-lg text-xs flex items-center justify-center"
                            style={{
                                transform: 'translate(10%, -20%) rotate(-3deg)',
                            }}
                        ></div>
                        {/* Display number of cards on each hand */}
                        <div
                            key={`debug-card-${opp.id}2`}
                            className="absolute drop-shadow-xl z-30 w-12 h-16 bg-blue-600 border-2 border-white rounded shadow-lg text-xs flex items-center justify-center"
                            style={{
                                transform: 'translate(30%, -20%)',
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
                <div className="text-center">
                    {declaredRank && !isNewRound && (
                        <div className="p-4 w-28 h-28 drop-shadow-lg absolute" style={{ left: '-120px', top: '-120px' }}>
                            <div className="text-lg opacity-75 z-50">Playing</div>
                            <div className="text-6xl font-bold text-yellow-400">{declaredRank || "—"}</div>
                        </div>)}

                        <div className="absolute" style={{ left: '120px', top: '120px' }}>
                            {pileCards.length > 0 && (
                                    <>
                                        <div className="text-lg opacity-75">Pile</div>
                                        <div className="text-5xl font-bold opacity-75">{pileCards.length}</div>
                                    </>
                            )}
                            {/* Pile animation popup */}
                            {pileAnimation && (
                                <div
                                    className={`absolute z-40 pointer-events-none text-5xl font-bold`}
                                    style={{
                                        left: '40px',
                                        top: '50px',
                                        transform: 'translate(-20%, 50%)',
                                        animation: 'popUp 1.5s ease-out',
                                        textShadow: '0 0 10px rgba(0,0,0,1)'
                                    }}
                                >
                                    {pileAnimation.text}
                                </div>
                            )}
                        </div>
                </div>

                {/* Call Bluff Button */}
                {isMyTurn && state.pile_size > 0 && state.currentRank && !hasActed && (
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

            {/* Revealed cards overlay */}
            {revealedCards && (
              <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
                <div className="text-center">
                  {/* Dramatic result text */}
                  <div
                    className="text-8xl font-bold mb-2 satisfy-regular"
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
                  <div className="text-2xl mb-8 text-white">
                     {revealedCards.wasLying ? (
                        <>
                        <p className="mb-2">
                          {revealedCards.accused === 0 ? "You" : `Player ${revealedCards.accused}`} declared:
                          <span className="text-yellow-400 font-bold ml-2">{revealedCards.declaredRank}</span>
                        </p>
                        <p className="text-lg opacity-75">Actually played:</p>
                        </>
                     )
                     : (
                        <p className="mb-2">
                          {revealedCards.caller === 0 ? "You pick" : `Player ${revealedCards.caller} picks`} up the pile.
                        </p>
                     )}
                  </div>

                  {/* Cards - only show if they were lying */}
                  {revealedCards.wasLying ? (
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
                  ) : <></>}
                </div>
              </div>
            )}

            {/* My Hand Section */}
            <div
            style={{
                position: 'fixed',
                left: '50%',
                bottom: '20px',
                transform: 'translateX(-50%)'
            }}
            className="z-10"
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
                            {state.yourHand.map((card, index) => {
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

                    {/* Play Controls */}
                    {isMyTurn && !hasActed && (
                        <div className="h-10 flex items-center justify-center gap-4">
                            {/* Only show rank input for new rounds */}
                            {isMyTurn && showRankInput && (
                                <input
                                    type="text"
                                    placeholder="Rank (e.g. 7)"
                                    value={declaredRank}
                                    onChange={(e) => setDeclaredRank(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            play();
                                        }
                                    }}
                                    className={`px-4 py-2 rounded-lg border-2 border-blue-600 bg-blue-900 text-white text-center font-bold
                                    text-lg w-40 transition-transform ${rankError ? "animate-wiggle border-red-500 bg-red-500" : "border-blue-600 bg-blue-900"}`}
                                />
                            )}
                            <button
                                onClick={play}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        play();
                                    }
                                }}
                                disabled={
                                    selectedCards.length === 0 ||
                                    selectedCards.length > 3 ||
                                    (isNewRound && !declaredRank)
                                }
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-8 rounded-lg transition-colors"
                            >
                                Play {selectedCards.length} Card{selectedCards.length !== 1 ? "s" : ""}
                            </button>
                        </div>
                    )}
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

        {/* Discard animation - floating message from player */}
        {discardAnimation && (
            <div
            className="absolute z-30 pointer-events-none"
            style={{
                left: `calc(50% + ${discardAnimation.x}px)`,
                top: `calc(50% + ${discardAnimation.y}px)`,
                animation: 'floatUp 4s ease-out',
            }}
            >
            <div className="text-2xl font-bold text-grey-400 drop-shadow-lg">
                {discardAnimation.message}
            </div>
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