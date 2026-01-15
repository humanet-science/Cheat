import {
  usePlayer,
  useRound,
} from "@empirica/core/player/classic/react";
import React, { useState, useEffect } from "react";
import CheatGame from "../../../cheat_frontend/src/CheatGame.jsx";
import {HumanetLogo} from "../../../cheat_frontend/src/utils/Logo.jsx";

export function Stage() {
  const player = usePlayer();
  const ws = player.get("gameWs");

  const [gameConfig, setGameConfig] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log("Stage received:", msg);

      if (msg.type === 'new_round') {
        const {type, ...gameState} = msg;

        // Set persistent game config (only once)
        if (!gameConfig) {
          setGameConfig({
            experimentalMode: msg.experimental_mode,
            numPlayers: msg.num_players,
            predefinedMessages: msg.predefined_messages,
            selfId: msg.your_info.id,
          });
        }

        // Set current round state
        setCurrentRound({
          state: gameState,
          currentPlayer: msg.current_player,
          selfId: msg.your_info.id,
          hasActed: msg.current_player !== msg.your_info.id
        });

        setIsReady(true);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, gameConfig]);

  const updateRoundState = (newRoundData) => {
    setCurrentRound(newRoundData);
  };

  const handleExitGame = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: "quit" }));
    }
  };

  if (!ws) {
    return <div className="text-center text-white">Connecting to game...</div>;
  }

  if (!isReady || !gameConfig || !currentRound) {
    return <div className="text-center text-white">Waiting for game to start...</div>;
  }

  return (
    <div className="cheat min-h-screen bg-gradient-to-br flex flex-col from-green-900 to-blue-900" id="game-root">
      <div className="flex-1 overflow-auto">
        Miao
        {/*<CheatGame*/}
        {/*  socket={ws}*/}
        {/*  gameConfig={gameConfig}*/}
        {/*  currentRound={currentRound}*/}
        {/*  onUpdateRound={updateRoundState}*/}
        {/*  onExitGame={handleExitGame}*/}
        {/*/>*/}
      </div>
      <div className="">
        <HumanetLogo/>
      </div>
    </div>
  );
}