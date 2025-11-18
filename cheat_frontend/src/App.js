import React, {useState} from "react";
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
            gameSocket.close();
        }
        setGameSocket(null);
        setGameConfig(null);
        setCurrentRound(null);
        setGameStarted(false);
    };

    return (<div className="min-h-screen bg-gradient-to-br flex flex-col from-green-900 to-blue-900">
        <div className="flex-1 overflow-auto z-10">
            {!gameStarted ? (
                <WelcomePage onGameStart={handleGameStart}/>
            ) : (
                <CheatGame
                socket={gameSocket}
                gameConfig={gameConfig}
                currentRound={currentRound}
                onUpdateRound={updateRoundState}
                onExitGame={handleExitGame}
            />)}
        </div>
        <div className="">
            <HumanetLogo/>
        </div>
    </div>);
}

export default App;