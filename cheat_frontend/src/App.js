import React, {useState, useEffect} from "react";
import CheatGame from "./CheatGame";
import WelcomePage from "./WelcomePage";
import {HumanetLogo} from "./utils/Logo";

function App() {

	const [gameStarted, setGameStarted] = useState(false);
	const [gameSocket, setGameSocket] = useState(null);

	// Game state that doesn't change between rounds
	const [gameConfig, setGameConfig] = useState(null);

	// Round-specific state that gets passed to CheatGame
	const [currentRound, setCurrentRound] = useState(null);

	const handleGameStart = (socket, initialGameData) => {
		console.log("Game starting, transitioning to CheatGame");

		// Set up persistent game configuration
		if (initialGameData.type === 'new_round') {
			const {type, ...gameState} = initialGameData;

			// Set persistent game config
			setGameConfig({
				experimentalMode: initialGameData.experimental_mode,
				numPlayers: initialGameData.num_players,
				predefinedMessages: initialGameData.predefined_messages,
				selfId: initialGameData.your_info.id,
			});

			// Set current round state
			setCurrentRound({
				state: gameState,
				currentPlayer: initialGameData.current_player,
				selfId: initialGameData.your_info.id,
				hasActed: initialGameData.current_player !== initialGameData.your_info.id
			});
		}

		setGameSocket(socket);
		setGameStarted(true);
	};

	// Function to update round state (can be called from CheatGame)
	const updateRoundState = (newRoundData) => {
		setCurrentRound(newRoundData);
	};

	const handleExitGame = () => {
		if (gameSocket) {
			// Set up one-time listener for quit confirmation
			const handleQuitConfirm = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.type === "quit_confirmed") {
						gameSocket.close();
						cleanup();
					}
				} catch (e) {
					// Ignore parse errors
				}
			};
			gameSocket.addEventListener('message', handleQuitConfirm);

			// Fallback: close after timeout if no confirmation
			setTimeout(() => {
				gameSocket.removeEventListener('message', handleQuitConfirm);
				gameSocket.close();
				cleanup();
			}, 1000);
		}
		const cleanup = () => {
			setGameSocket(null);
			setGameConfig(null);
			setCurrentRound(null);
			setGameStarted(false);
		};
	};

	const [showLogo, setShowLogo] = useState(window.innerHeight > 600);

	useEffect(() => {
			const handleResize = () => {
					setShowLogo(window.innerHeight > 600);
			};

			window.addEventListener('resize', handleResize);
			return () => window.removeEventListener('resize', handleResize);
	}, []);

	return (<div className="min-h-screen bg-gradient-to-br flex flex-col from-green-900 to-blue-900" id="game-root">
		<div className="flex-1 overflow-auto">
			{!gameStarted ? (
				<WelcomePage onGameStart={handleGameStart}/>) : (<CheatGame
				socket={gameSocket}
				gameConfig={gameConfig}
				currentRound={currentRound}
				onUpdateRound={updateRoundState}
				onExitGame={handleExitGame}
			/>)}
		</div>
		{showLogo && !gameStarted && (
				<div>
						<HumanetLogo/>
				</div>
		)}
	</div>);
}

export default App;
