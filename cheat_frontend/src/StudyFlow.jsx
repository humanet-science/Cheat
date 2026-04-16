import React, { useState, useEffect, useRef } from "react";
import Tutorial from "./components/Tutorial";
import LoadingWindow from "./components/GameLoading";
import StudyThanks from "./components/StudyThanks";
import { PlayerNameInput, AvatarSelection } from "./components/WelcomeBox";

const getAPIBaseURL = () => {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "http://localhost:5050";
    }
    return `${window.location.protocol}//${hostname}`;
};

const postParticipant = async (payload) => {
    const res = await fetch(`${getAPIBaseURL()}/api/participant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return res.json();
};

const getWebSocketURL = () => {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "ws://localhost:5050/ws";
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${hostname}/cheat-ws/ws`;
};

const sampleCards = [
    { rank: "A", suit: "♥", isRed: true },
    { rank: "K", suit: "♠", isRed: false },
    { rank: "Q", suit: "♦", isRed: true },
    { rank: "J", suit: "♣", isRed: false },
    { rank: "10", suit: "♥", isRed: true },
];

function ProlificGate({ onId }) {
    const [value, setValue] = useState("");

    return (
        <div className="min-h-screen flex items-center justify-center px-4" id="game-root">
            <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-lg">

                {/* Fanned card icons */}
                <div className="flex justify-center mb-2 mt-8 relative" style={{ height: "5.5rem" }}>
                    {sampleCards.map((card, index) => (
                        <div
                            key={index}
                            className="absolute bg-white rounded-lg border-2 border-gray-400"
                            style={{
                                width: "3.25rem",
                                height: "4.5rem",
                                transform: `translateY(-30px) rotate(${index * 15 - 30}deg) translateX(${index * 20 - 40}px)`,
                                zIndex: index,
                            }}
                        >
                            <div className="w-full h-full relative">
                                <div className={`absolute top-1 left-1.5 text-xs leading-none ${card.isRed ? "text-red-600" : "text-gray-900"}`}>
                                    <div className="font-bold">{card.rank}</div>
                                    <div className="text-xs">{card.suit}</div>
                                </div>
                                <div className={`absolute inset-0 flex items-center justify-center text-lg ${card.isRed ? "text-red-600" : "text-gray-900"}`}>
                                    {card.suit}
                                </div>
                                <div className={`absolute bottom-1 right-1.5 text-xs leading-none transform rotate-180 ${card.isRed ? "text-red-600" : "text-gray-900"}`}>
                                    <div className="font-bold">{card.rank}</div>
                                    <div className="text-xs">{card.suit}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <p className="text-2xl text-center font-bold text-gray-700 mb-4">
                    Thank you for participating!
                </p>
                <p className="text-lg text-justify hyphens-auto text-gray-700 mb-6">
                    This experiment is part of a research project conducted by the{" "}
                    <a href="https://humanet.science" style={{ color: "#6DB4EE" }}>Humanet lab</a>{" "}
                    at the London School of Economics and Political Science. The results will be
                    presented at scientific meetings or published in scientific journals.
                    <span className="font-bold"> All collected data is fully anonymised. </span>
                </p>

                <p className="text-lg text-left text-gray-700">
                    To continue, please enter your Prolific ID:
                </p>

                <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onId(value.trim()); }}>
                    <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-4 sm:px-0 px-6">
                        <input
                            type="text"
                            autoComplete="off"
                            placeholder="Prolific ID"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                            autoFocus
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={!value.trim()}
                            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                                text-white whitespace-nowrap font-bold py-3 px-6 rounded-lg transition-colors text-lg"
                        >
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const StudyFlow = ({ onGameStart, onProlificId }) => {
    const [prolificId, setProlificId] = useState(null);
    const [phase, setPhase] = useState("prolific"); // 'prolific' | 'tutorial' | 'setup' | 'waiting' | 'no_games' | 'already_participated'
    const [allowSkip, setAllowSkip] = useState(false);
    const [playerName, setPlayerName] = useState("");
    const [selectedAvatar, setSelectedAvatar] = useState("");
    const [socket, setSocket] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [maxWaitSeconds, setMaxWaitSeconds] = useState(null);
    const [secondsLeft, setSecondsLeft] = useState(null);
    const countdownRef = useRef(null);

    const handleSetup = (e) => {
        e.preventDefault();
        if (!playerName.trim() || !selectedAvatar) return;

        const ws = new WebSocket(getWebSocketURL());
        setSocket(ws);

        ws.onopen = () => {
            ws.send(JSON.stringify({
                type: "study_join",
                name: playerName.trim(),
                avatar: selectedAvatar,
                prolific_id: prolificId ?? "",
            }));
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            console.log("StudyFlow received:", msg);

            if (msg.type === "queue_joined") {
                if (msg.max_wait_seconds) setMaxWaitSeconds(msg.max_wait_seconds);
                setPhase("waiting");
            } else if (msg.type === "new_round") {
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                if (prolificId !== "admin") {
                    postParticipant({ prolific_id: prolificId ?? "", game_assigned: true });
                }
                onGameStart(ws, msg);
            } else if (msg.type === "no_games_available") {
                ws.close();
                setSocket(null);
                setPhase("no_games");
            }
        };

        ws.onerror = () => setPhase("setup");
        ws.onclose = () => setPhase((prev) => (prev === "waiting" ? "setup" : prev));
    };

    const handleCancelWaiting = () => {
        if (socket) {
            socket.send(JSON.stringify({ type: "exit_queue" }));
            socket.close();
            setSocket(null);
        }
        clearInterval(countdownRef.current);
        setPhase("setup");
    };

    // Countdown timer: fires when waiting phase starts with a known max wait
    useEffect(() => {
        if (phase !== "waiting" || !maxWaitSeconds) return;
        let remaining = maxWaitSeconds;
        setSecondsLeft(remaining);
        countdownRef.current = setInterval(() => {
            remaining -= 1;
            setSecondsLeft(remaining);
            if (remaining <= 0) {
                clearInterval(countdownRef.current);
                if (socket) {
                    socket.send(JSON.stringify({ type: "exit_queue" }));
                    socket.close();
                    setSocket(null);
                }
                setPhase("timed_out");
            }
        }, 1000);
        return () => clearInterval(countdownRef.current);
    }, [phase, maxWaitSeconds]);

    if (phase === "prolific") {
        return (
            <ProlificGate onId={async (id) => {
                setProlificId(id);
                onProlificId(id);
                if (id === "admin") {
                    setAllowSkip(true);
                    setPhase("tutorial");
                } else {
                    const status = await postParticipant({ prolific_id: id });
                    if (status.game_assigned) {
                        setPhase("already_participated");
                    } else {
                        setAllowSkip(status.tutorial_done);
                        setPhase("tutorial");
                    }
                }
            }} />
        );
    }

    if (phase === "tutorial") {
        return (
            <div className="h-screen overflow-auto">
                <Tutorial
                    allowSkip={allowSkip}
                    onClose={() => {
                        if (prolificId !== "admin") {
                            postParticipant({ prolific_id: prolificId ?? "", tutorial_done: true });
                        }
                        setPhase("setup");
                    }}
                />
            </div>
        );
    }

    if (phase === "already_participated") {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" id="game-root">
                <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md">
                    <p className="text-xl font-bold text-gray-700 mb-3">You have already participated</p>
                    <p className="text-gray-500">
                        Our records indicate that you have already taken part in this study.
                        If you believe this is an error, please contact the research team.
                    </p>
                </div>
            </div>
        );
    }

    if (phase === "setup") {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <form onSubmit={(e) => { e.preventDefault(); setShowConfirm(true); }} className="rounded-2xl bg-white p-8 max-w-md w-full shadow-2xl">
                    <h2 className="text-xl font-bold text-gray-700 mb-2">You're in!</h2>

                    <p className="text-gray-500 text-sm mb-6">
                        Choose a name and avatar, then join the waiting room. The game will start automatically once enough players have joined.
                    </p>
                    <PlayerNameInput playerName={playerName} setPlayerName={setPlayerName} />
                    <AvatarSelection
                        selectedAvatar={selectedAvatar}
                        setSelectedAvatar={setSelectedAvatar}
                        random_shuffle={true}
                        nrows={4}
                        scrollable={false}
                    />
                    <button
                        type="submit"
                        disabled={!playerName.trim() || !selectedAvatar}
                        className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                            text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg mt-2"
                    >
                        Join Waiting Room
                    </button>
                </form>

                {showConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 px-4">
                        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">⚠️ Before you join</h3>
                            <p className="text-gray-600 mb-8">
                                You are about to join the waiting room and will be automatically assigned to the next
                                available game. If no games are available, you will be given a completion
                                code after a timeout and you will be marked as having participated. While in the
                                waiting room, you can exit and re-join at any point. However, once the game has started
                                closing or refreshing the browser tab will cause you to exit the study without
                                receiving a completion code.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={(e) => { setShowConfirm(false); handleSetup(e); }}
                                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
                                >
                                    I understand — Join
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (phase === "no_games") {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md">
                    <p className="text-xl font-bold text-gray-700 mb-3">No games available right now</p>
                    <p className="text-gray-500 mb-6">
                        All study slots have been filled. Please check back later or contact the research team.
                    </p>
                    <button
                        onClick={() => setPhase("setup")}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    if (phase === "waiting") {
        return (
            <LoadingWindow
                handleCancelWaiting={handleCancelWaiting}
                showCancel={true}
                secondsLeft={secondsLeft}
            />
        );
    }

    if (phase === "timed_out") {
        return <StudyThanks timedOut={true} />;
    }

    return null;
};

export default StudyFlow;
