import {
	usePlayer, useRound,
} from "@empirica/core/player/classic/react";
import React, {useState, useEffect} from "react";
import CheatGame from "../../../cheat_frontend/src/CheatGame.jsx";
import {HumanetLogo} from "../../../cheat_frontend/src/utils/Logo.jsx";
import {useWebSocket} from './WebSocketContext';

export function Stage() {
	const player = usePlayer();
	const {ws} = useWebSocket();

	const [gameConfig, setGameConfig] = useState(null);
	const [currentRound, setCurrentRound] = useState(null);
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		if (!ws) return;


		console.log("Setting up WebSocket handler in Stage", ws);

		const handleMessage = (event) => {
			console.log("Raw event received:", event);
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

		ws.onmessage = handleMessage;

		// Send ready signal to backend
		console.log("WebSocket methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(ws)));
		console.log("ws type:", ws.constructor.name, ws);
		ws.send(JSON.stringify({
			type: "player_ready", empirica_id: player.id
		}));
		console.log("Sent player_ready signal");

		return () => {
			console.log("Cleaning up WebSocket handler");
			ws.onmessage = null;
		};
	}, [ws]);

	const updateRoundState = (newRoundData) => {
		setCurrentRound(newRoundData);
	};

	const handleExitGame = () => {

      if (ws) {
				ws.close();
			}
	};


	if (!ws) {
		return <div className="text-center text-white">Connecting to game...</div>;
	}

	if (!isReady || !gameConfig || !currentRound) {
		return <div className="text-center text-white">Waiting for game to start...</div>;
	}

	return (<div id="game-root">
		<CheatGame
			socket={ws}
			gameConfig={gameConfig}
			currentRound={currentRound}
			onUpdateRound={updateRoundState}
			onExitGame={handleExitGame}
      empiricaPlayer={player}
		/>
		<div className="">
			<HumanetLogo/>
		</div>
	</div>);
}