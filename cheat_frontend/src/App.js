import React, { useState, useEffect } from "react";
import CheatGame from "./CheatGame";
import WelcomePage from "./WelcomePage";
import StudyFlow from "./StudyFlow";
import ExitSurvey from "./components/ExitSurvey";
import StudyThanks from "./components/StudyThanks";
import { HumanetLogo } from "./utils/Logo";

// Study mode: served from study.humanet.science, or ?study=true for local dev
const IS_STUDY =
    window.location.hostname === "study.humanet.science" ||
    new URLSearchParams(window.location.search).get("study") === "true";

function App() {
    // Shared game state
    const [gameSocket, setGameSocket] = useState(null);
    const [gameConfig, setGameConfig] = useState(null);
    const [currentRound, setCurrentRound] = useState(null);
    const [gameId, setGameId] = useState(null);

    // Regular mode
    const [gameStarted, setGameStarted] = useState(false);

    // Study mode phases: 'prelim' | 'game' | 'survey' | 'done'
    const [studyPhase, setStudyPhase] = useState("prelim");
    const [prolificId, setProlificId] = useState(null);

    const handleGameStart = (socket, initialGameData) => {

        socket._initialBuffer = [];
        socket.onmessage = (e) => socket._initialBuffer.push(JSON.parse(e.data));

        if (initialGameData.type === "new_round") {
            const { type, ...gameState } = initialGameData;
            setGameConfig({
                experimentalMode: initialGameData.experimental_mode,
                numPlayers: initialGameData.num_players,
                predefinedMessages: initialGameData.predefined_messages,
                selfId: initialGameData.your_info.id,
            });
            setCurrentRound({
                state: gameState,
                currentPlayer: initialGameData.current_player,
                selfId: initialGameData.your_info.id,
                hasActed: initialGameData.current_player !== initialGameData.your_info.id,
            });
            setGameId(initialGameData.game_id ?? null);
        }
        setGameSocket(socket);
        if (IS_STUDY) {
            setStudyPhase("game");
        } else {
            setGameStarted(true);
        }
    };

    const updateRoundState = (newRoundData) => {
        setCurrentRound(newRoundData);
    };

    const handleExitGame = () => {
        const cleanup = () => {
            setGameSocket(null);
            setGameConfig(null);
            setCurrentRound(null);
            if (IS_STUDY) {
                setStudyPhase("survey");
            } else {
                setGameStarted(false);
            }
        };

        if (gameSocket) {
            const handleQuitConfirm = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "quit_confirmed") {
                        gameSocket.close();
                        cleanup();
                    }
                } catch (e) {}
            };
            gameSocket.addEventListener("message", handleQuitConfirm);
            setTimeout(() => {
                gameSocket.removeEventListener("message", handleQuitConfirm);
                gameSocket.close();
                cleanup();
            }, 1000);
        } else {
            cleanup();
        }
    };

    const [showLogo, setShowLogo] = useState(window.innerHeight > 600);
    useEffect(() => {
        const handleResize = () => setShowLogo(window.innerHeight > 600);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const wrapper = (children, hideLogo = false) => (
        <div className="min-h-screen bg-gradient-to-br flex flex-col from-green-900 to-blue-900" id="game-root">
            <div className="flex-1 overflow-auto">{children}</div>
            {showLogo && !hideLogo && <div><HumanetLogo /></div>}
        </div>
    );

    // ── Study mode ────────────────────────────────────────────────────────────
    if (IS_STUDY) {
        if (studyPhase === "prelim") {
            return wrapper(
                <StudyFlow onGameStart={handleGameStart} onProlificId={setProlificId} />,
                true
            );
        }
        if (studyPhase === "game") {
            return wrapper(
                <CheatGame
                    socket={gameSocket}
                    gameConfig={gameConfig}
                    currentRound={currentRound}
                    onUpdateRound={updateRoundState}
                    onExitGame={handleExitGame}
                    onFinish={handleExitGame}
                />,
                true
            );
        }
        if (studyPhase === "survey") {
            return wrapper(
                <ExitSurvey
                    prolificId={prolificId}
                    gameId={gameId}
                    onSubmit={() => setStudyPhase("done")}
                />,
                true
            );
        }
        if (studyPhase === "done") {
            return wrapper(<StudyThanks />, true);
        }
    }

    // ── Regular mode (unchanged) ──────────────────────────────────────────────
    return wrapper(
        !gameStarted ? (
            <WelcomePage onGameStart={handleGameStart} />
        ) : (
            <CheatGame
                socket={gameSocket}
                gameConfig={gameConfig}
                currentRound={currentRound}
                onUpdateRound={updateRoundState}
                onExitGame={handleExitGame}
            />
        ),
        gameStarted
    );
}

export default App;
