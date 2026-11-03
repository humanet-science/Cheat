import React, { useState, useEffect } from "react";
import CheatGame from "./CheatGame";
import WelcomePage from "./WelcomePage";
import StudyFlow from "./StudyFlow";
import ExitSurvey from "./components/ExitSurvey";
import StudyThanks from "./components/StudyThanks";
import { HumanetLogo } from "./utils/Logo";
import { WS_URL } from "./config";
import { SESSION_KEYS, clearSessionToken, getSession, setSession } from "./utils/session";
import { setLogContext } from "./utils/clientLogger";

// Study mode: served from study.humanet.science, or ?study=true for local dev
const IS_STUDY =
    window.location.hostname === "study.humanet.science" ||
    new URLSearchParams(window.location.search).get("study") === "true";

// How long a refreshed page keeps trying to rejoin its game. The server only holds the seat once
// it has noticed the old connection close, so the first attempts can fail.
const RESUME_TIMEOUT_MS = 10000;
const RESUME_RETRY_MS = 1000;

// Study phase to start in: an explicit ?phase= wins; otherwise pick up where this tab left off.
// A tab that was in a game but no longer holds a seat token has finished it, so goes to the survey.
const getInitialStudyPhase = () => {
    const urlPhase = new URLSearchParams(window.location.search).get("phase");
    if (urlPhase) return urlPhase;
    const storedPhase = getSession(SESSION_KEYS.studyPhase);
    if (storedPhase === "game") return getSession(SESSION_KEYS.token) ? "game" : "survey";
    return storedPhase ?? "prelim";
};

function App() {
    // Shared game state
    const [gameSocket, setGameSocket] = useState(null);
    const [gameConfig, setGameConfig] = useState(null);
    const [currentRound, setCurrentRound] = useState(null);
    const [gameId, setGameId] = useState(() => (IS_STUDY ? getSession(SESSION_KEYS.gameId) : null));

    // Rejoining a running game after a page refresh: true while trying, and whether the current game was resumed
    const [resuming, setResuming] = useState(() => Boolean(getSession(SESSION_KEYS.token)));
    const [resumed, setResumed] = useState(false);

    // Regular mode
    const [gameStarted, setGameStarted] = useState(false);

    // Study mode phases: 'prelim' | 'game' | 'survey' | 'done'
    const [studyPhase, setStudyPhase] = useState(getInitialStudyPhase);
    const [prolificId, setProlificIdState] = useState(() => getSession(SESSION_KEYS.prolificId));
    const setProlificId = (id) => {
        setProlificIdState(id);
        setSession(SESSION_KEYS.prolificId, id);
        setLogContext({ prolific_id: id });
    };

    // Identify this player's diagnostic reports (see utils/clientLogger.js)
    useEffect(() => {
        if (prolificId) setLogContext({ prolific_id: prolificId });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Remember the study phase in this tab, so a refresh lands back in the game, survey or thank-you page
    useEffect(() => {
        if (!IS_STUDY) return;
        setSession(SESSION_KEYS.studyPhase, ["game", "survey", "done"].includes(studyPhase) ? studyPhase : null);
    }, [studyPhase]);

    // Start a game from its first message: 'new_round' for a new game, or 'reconnect_confirmed' when
    // rejoining a running game after a refresh. In the latter case, the message is also handed to
    // CheatGame so it restores the reconnect state (e.g. the end-of-round screen).
    const handleGameStart = (socket, initialGameData, { resumed: isResumed = false } = {}) => {

        // Seat token received while queueing: from now on, a refresh of this tab rejoins the game
        if (socket._sessionToken) setSession(SESSION_KEYS.token, socket._sessionToken);

        socket._initialBuffer = isResumed ? [initialGameData] : [];
        socket.onmessage = (e) => socket._initialBuffer.push(JSON.parse(e.data));

        if (initialGameData.type === "new_round" || initialGameData.type === "reconnect_confirmed") {
            const { type, ...gameState } = initialGameData;
            setGameConfig({
                experimentalMode: initialGameData.experimental_mode,
                numPlayers: initialGameData.num_players,
                predefinedMessages: initialGameData.predefined_messages,
                doubleDisguise: Boolean(initialGameData.double_disguise),
                selfId: initialGameData.your_info.id,
            });
            setCurrentRound({
                state: gameState,
                currentPlayer: initialGameData.current_player,
                selfId: initialGameData.your_info.id,
                hasActed: initialGameData.current_player !== initialGameData.your_info.id,
            });
            setGameId(initialGameData.game_id ?? null);
            setLogContext({ game_id: initialGameData.game_id ?? null, player_id: initialGameData.your_info.id });
            if (IS_STUDY) setSession(SESSION_KEYS.gameId, initialGameData.game_id ?? null);
        }
        setResumed(isResumed);
        setGameSocket(socket);
        if (IS_STUDY) {
            setStudyPhase("game");
        } else {
            setGameStarted(true);
        }
    };

    // Back/forward navigation can restore this page from the browser's back/forward cache, frozen as it
    // was when the player navigated away: the game reappears, but its connection is dead and the server
    // has marked the player as disconnected. If a game is running, reload instead, which rejoins it.
    useEffect(() => {
        const onPageShow = (e) => {
            if (e.persisted && getSession(SESSION_KEYS.token)) window.location.reload();
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, []);

    // On load, if this tab holds a seat token, try to rejoin that game before showing anything else
    useEffect(() => {
        if (!resuming) return;
        const token = getSession(SESSION_KEYS.token);
        const deadline = Date.now() + RESUME_TIMEOUT_MS;
        let cancelled = false;
        let ws = null;
        let retryTimer = null;

        // Could not rejoin: the seat has gone (game over, or the player was replaced or the game terminated).
        // In the study they did play a game, so continue to the survey; otherwise back to the start page.
        const giveUp = () => {
            clearSessionToken();
            if (IS_STUDY) setStudyPhase(getSession(SESSION_KEYS.gameId) ? "survey" : "prelim");
            setResuming(false);
        };

        const attempt = () => {
            if (cancelled) return;
            const socket = new WebSocket(WS_URL);
            ws = socket;
            let settled = false;
            const retry = () => {
                if (settled || cancelled) return;
                settled = true;
                socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
                try { socket.close(); } catch (e) {}
                if (Date.now() < deadline) {
                    retryTimer = setTimeout(attempt, RESUME_RETRY_MS);
                } else {
                    giveUp();
                }
            };
            socket.onopen = () => socket.send(JSON.stringify({ type: "reconnect", token }));
            socket.onmessage = (e) => {
                let msg;
                try { msg = JSON.parse(e.data); } catch (err) { return; }
                if (msg.type === "reconnect_confirmed") {
                    settled = true;
                    socket.onerror = socket.onclose = null;
                    handleGameStart(socket, msg, { resumed: true });
                    if (IS_STUDY) setStudyPhase("game");
                    setResuming(false);
                } else if (msg.type === "reconnect_failed") {
                    // Server may not have noticed the old connection close yet: try again shortly
                    retry();
                } else if (msg.type === "server_error") {
                    // Game has ended
                    settled = true;
                    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
                    try { socket.close(); } catch (err) {}
                    giveUp();
                }
            };
            socket.onerror = retry;
            socket.onclose = retry;
        };

        attempt();

        // Abandon this attempt if unmounted (also covers React StrictMode's double effect run in
        // development: the socket is closed before it opens, so the reconnect message is never sent)
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
            if (ws && ws.readyState !== WebSocket.OPEN) {
                ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
                try { ws.close(); } catch (e) {}
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const updateRoundState = (newRoundData) => {
        setCurrentRound(newRoundData);
    };

    const handleExitGame = () => {
        const cleanup = () => {
            clearSessionToken();
            setResumed(false);
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

    // Rejoining a game after a page refresh
    if (resuming) {
        return wrapper(
            <div className="min-h-screen flex items-center justify-center text-white text-xl">
                Reconnecting to your game…
            </div>,
            true
        );
    }

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
                    resumed={resumed}
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
                resumed={resumed}
            />
        ),
        gameStarted
    );
}

export default App;
