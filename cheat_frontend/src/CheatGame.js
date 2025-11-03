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

    // Track input error
    const VALID_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] // Aces cannot be declared!
    const [rankError, setRankError] = useState(false);

    // Track game over
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);

    useEffect(() => {

        const socket = new WebSocket("ws://localhost:5050/ws");

        socket.onmessage = (event) => {

          const msg = JSON.parse(event.data);
          console.log("Received message:", msg);

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

            // Check if opponent played cards and show a message displaying an update (i.e. cards played/cards picked up)
            if (prevState && msg.state.currentPlayer === msg.state.yourId) {

              // Check if any opponent's hand decreased and show a status update
              for (let i = 0; i < msg.state.hands.length; i++) {
                if (i !== msg.state.yourId) {
                  const cardChange = prevState.hands[i] - msg.state.hands[i];
                  if (cardChange > 0) {
                    setMessage(`Player ${i} played ${cardChange} card${cardChange !== 1 ? 's' : ''}`);
                    setTimeout(() => setMessage(""), 2000);
                    break;
                  } else if (cardChange <0) {
                      // Opponent picked up cards
                      const cardsPickedUp = -cardChange;
                      setMessage(`Player ${i} picks up ${cardsPickedUp} card${cardsPickedUp !== 1 ? 's' : ''}. Your turn!`);
                      setTimeout(() => setMessage(""), 2000);
                      break;
                  }
                }
              }
            }
            prevStateRef.current = msg.state;
            setState(msg.state);
            setHasActed(false);

            console.log("Current Rank:", declaredRank,);

          // Display the result of a call
          } else if (msg.type === "result") {
              let displayMessage = msg.result;

              if (state && msg.result.includes(`Player ${state.yourId} lied`)) {
                const match = msg.result.match(/Picks up (\d+) cards/i);
                const cardCount = match ? match[1] : "cards";
                displayMessage = `You lied! You pick up ${cardCount} cards!`;
              } else if (state && msg.result.includes(`Player ${state.yourId} told the truth`)) {
                displayMessage = msg.result.replace(`Player ${state.yourId}`, "You");
              } else {
                displayMessage = msg.result;
              }

              setMessage(displayMessage);
              setTimeout(() => setMessage(""), 3000);

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

    const play = useCallback(() => {

        const isMyTurn = state.currentPlayer === state.yourId;
        const isNewRound = (declaredRank === null || declaredRank === "");

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
        console.log(normalizedRank);
        // Check rank before sending
        if (!VALID_RANKS.includes(normalizedRank)) {
          setRankError(true);          // trigger UI feedback
          setTimeout(() => setRankError(false), 500); // reset after wiggle
          return;
        }

        console.log("Playing:", { declaredRank, selectedCards });
        ws.send(
        JSON.stringify({
          type: "play",
          declared_rank: declaredRank,
          cards: selectedCards,
        })
        );
        setSelectedCards([]);
        setHasActed(true);
        setShowRankInput(false);
    }, [selectedCards, declaredRank, ws]);

    // Add this useEffect for Enter key
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

      const isMyTurn = state.currentPlayer === state.yourId;
      const isNewRound = !declaredRank; // "" or null both mean new round

      if (isMyTurn && isNewRound) {
        setShowRankInput(true);
      } else {
        setShowRankInput(false);
      }
    }, [state]);

    if (!state) {
        return (
          <div className="min-h-screen bg-blue-950 flex items-center justify-center text-white text-xl">
            Loading game...
          </div>
        );
    }

    const isMyTurn = state.currentPlayer === state.yourId;
    const isNewRound = (declaredRank === null || declaredRank === "");

    const toggleCard = (card) => {
    console.log("Toggling card:", card);
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

    // Get opponent info (all players except current player)
    const opponents = state.hands
    .map((cardCount, index) => ({
      id: index,
      cardCount: cardCount,
    }))
    .filter((_, index) => index !== state.yourId);
    console.log("Show rank input:", showRankInput);
    return (

    <div className="min-h-screen text-white flex flex-col p-6">
      {/* Game over */}
        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-white text-3xl font-bold z-50">
            <div className="mb-6">{`🎉 Player ${winner} wins! 🎉`}</div>
            <button
              onClick={() => {
                ws.send(JSON.stringify({ type: "new_game" }));
                setGameOver(false);
                setWinner(null);
                setMessage("");
                setSelectedCards([]);     // clear any lingering selections
                setDeclaredRank("");      // reset the rank box
                setHasActed(false);       // reset action flag
              }}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl text-lg"
            >
              New Game
            </button>
          </div>
        )}

      {/* Message Banner */}
        {message && !gameOver && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-blue-950 px-6 py-3 rounded-lg font-bold text-lg shadow-lg z-50">
            {message}
          </div>
        )}

      {/* Opponents Section */}
      <div className="flex justify-center gap-4 mb-8">
        {opponents.map((opp) => (
          <div
            key={opp.id}
            className={`bg-blue-800 rounded-lg p-4 min-w-[120px] border-2 ${
              state.currentPlayer === opp.id
                ? "border-yellow-400"
                : "border-blue-600"
            }`}
          >
            <div className="text-center">
              <div className="text-sm opacity-75">Player {opp.id}</div>
              <div className="text-3xl font-bold mt-1">{opp.cardCount}</div>
              <div className="text-xs opacity-75 mt-1">cards</div>
            </div>
          </div>
        ))}
      </div>

      {/* Center Pile Section */}
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-blue-800 rounded-xl p-8 border-4 border-blue-600 min-w-[300px]">
          <div className="text-center">
            <div className="text-lg opacity-75 mb-2">Pile</div>
            <div className="text-6xl font-bold mb-4">{state.pile_size}</div>
            <div className="text-sm opacity-75 mb-1">Declared rank:</div>
            <div className="text-3xl font-bold text-yellow-400">
              {state.currentRank || "—"}
            </div>
          </div>

          {/* Call Bluff Button - shown on your turn if opponent just played and you haven't acted */}
          {isMyTurn && state.pile_size > 0 && state.currentRank && !hasActed && (
            <div className="mt-6">
              <button
                onClick={callBluff}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Call Bluff!
              </button>
            </div>
          )}
        </div>
      </div>

      {/* My Hand Section */}
      <div className="bg-blue-800 rounded-xl p-6 border-2 border-blue-600">
        <div className="text-center mb-4">
          <div className="text-lg font-semibold">
            Your Hand
            {isMyTurn && (
              <span className="ml-3 text-yellow-400">(Your Turn)</span>
            )}
          </div>
        </div>

        {/* Cards */}
        <div className="flex justify-center flex-wrap gap-2 mb-4">
          {state.yourHand.map((card, index) => (
            <button
              key={`${card}-${index}`}
              onClick={() => toggleCard(card)}
              disabled={!isMyTurn}
              className={`px-4 py-6 text-xl font-bold rounded-lg border-2 transition-all ${
                selectedCards.includes(card)
                  ? "bg-yellow-400 text-blue-950 border-yellow-500 transform -translate-y-2"
                  : "bg-white text-blue-950 border-gray-300"
              } ${
                isMyTurn
                  ? "hover:bg-yellow-200 cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              {card}
            </button>
          ))}
        </div>

        {/* Play Controls */}
        {isMyTurn && !hasActed && (
          <div className="flex items-center justify-center gap-4">
            {/* Only show rank input for new rounds */}
            {isMyTurn && showRankInput && (
              <input
                type="text"
                placeholder="Rank (e.g., 7, J, A)"
                value={declaredRank}
                onChange={(e) => setDeclaredRank(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    play();
                  }
                }}
                className={`px-4 py-2 rounded-lg border-2 border-blue-600 bg-blue-900 text-white text-center font-bold
                text-lg w-40 transition-transform ${rankError ? "animate-wiggle border-red-500" : "border-blue-600 bg-blue-900"}`}
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

        {/* Debug info */}
        <div className="mt-4 text-center text-sm opacity-50">
          {selectedCards.length > 0 && (
            <span>Selected: {selectedCards.join(", ")}</span>
          )}
        </div>
      </div>
    </div>
    );
    }