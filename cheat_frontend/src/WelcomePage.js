// WelcomePage.js
import React, {useEffect, useState} from 'react';
import {Logo} from './utils/Logo';
import {AVATARS} from "./utils/constants";

const WelcomePage = ({onGameStart}) => {

    // Logo and welcome box animation
    const [animationPhase, setAnimationPhase] = useState('drawing'); // 'drawing' | 'buttons-visible' | 'form-visible'
    const [showSubtitle, setShowSubtitle] = useState(false);

    // Number of players chosen, game mode, player name, and avatar: passed to the game
    const [numPlayers, setNumPlayers] = useState(5);
    const [gameMode, setGameMode] = useState('single');
    const [playerName, setPlayerName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('');

    // Has accepted the T&Cs
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    // Help boxes for the menu options
    const [showGameModeHelp, setShowGameModeHelp] = useState(false);
    const [showNumPlayersHelp, setShowNumPlayersHelp] = useState(false);

    // Player has joined queue and is waiting animation
    const [isWaiting, setIsWaiting] = useState(false);

    // Socket
    const [socket, setSocket] = useState(null);

    const LoadingWindow = ({handleCancelWaiting}) => {
        const [cardAnimationPhase, setCardAnimationPhase] = useState('bottom');
        const [waitingDots, setWaitingDots] = useState('');

        // Card animation sequence with pauses
        useEffect(() => {
            const sequence = [{phase: 'bottom', duration: 250},      // (1) start at bottom - pause
                {phase: 'fanning-out', duration: 500}, // (2) move up and fan out
                {phase: 'top-pause', duration: 200},   // (3) pause at top
                {phase: 'fanning-in', duration: 300},  // (4) collapse back down
                {phase: 'bottom-bounce-down', duration: 150},// (5) bounce at bottom
                {phase: 'bottom-bounce-up', duration: 150},// (5) bounce at bottom
                {phase: 'bottom', duration: 100}       // (6) settle and pause
            ];

            let currentStep = 0;

            const runSequence = () => {
                const step = sequence[currentStep];
                setCardAnimationPhase(step.phase);

                currentStep = (currentStep + 1) % sequence.length;

                setTimeout(runSequence, step.duration);
            };

            const timer = setTimeout(runSequence, 0);

            return () => clearTimeout(timer);
        }, []);

        // Waiting dots animation
        useEffect(() => {
            const dotsInterval = setInterval(() => {
                setWaitingDots(prev => prev === '...' ? '' : prev + '.');
            }, 500);
            return () => clearInterval(dotsInterval);
        }, []);

        // Sample cards for the animation
        const sampleCards = [{rank: 'A', suit: '♥', isRed: true}, {rank: 'K', suit: '♠', isRed: false}, {
            rank: 'Q', suit: '♦', isRed: true
        }, {rank: 'J', suit: '♣', isRed: false}, {rank: '10', suit: '♥', isRed: true}];

        // Calculate transform based on phase
        const getTransform = (index, phase) => {
            switch (phase) {
                case 'bottom':
                    return `translateY(14px) rotate(0deg) translateX(0px)`;
                case 'fanning-out':
                case 'top-pause':
                    return `translateY(-30px) rotate(${index * 15 - 30}deg) translateX(${index * 20 - 40}px)`;
                case 'fanning-in':
                    return `translateY(10px) rotate(0deg) translateX(0px)`;
                case 'bottom-bounce-up':
                    return `translateY(4px) rotate(${index * 1.3 - 2.6}deg) translateX(0px)`;
                case 'bottom-bounce-down':
                    return `translateY(20px) rotate(0deg) translateX(0px)`;
                default:
                    return `translateY(0px) rotate(0deg) translateX(0px)`;
            }
        };

        // Get transition timing for each phase
        const getTransition = (phase) => {
            switch (phase) {
                case 'fanning-out':
                    return 'transform 0.5s ease-out'; // smooth ease going up
                case 'fanning-in':
                    return 'transform 0.5s ease-in';  // smooth ease coming down
                case 'bottom-bounce-up':
                    return 'transform 0.15s ease-out'; // quick bounce
                case 'bottom-bounce-down':
                    return 'transform 0.15s ease-in'; // quick bounce
                default:
                    return 'transform 0.1s ease-in-out'; // minimal transition for pauses
            }
        };

        return (<div
            className="fixed inset-0 bg-gradient-to-br from-green-900 to-blue-900 flex items-center justify-center z-50 overflow-hidden">
            <div className="text-center max-w-sm">

                {/* Card Animation Container */}
                <div className="flex justify-center mb-6 relative h-32 w-64">
                    {sampleCards.map((card, index) => (<div
                        key={index}
                        className={`absolute w-16 h-24 bg-white rounded-lg shadow-lg drop-shadow-lg border-2 border-gray-400`}
                        style={{
                            transform: getTransform(index, cardAnimationPhase),
                            transformOrigin: (cardAnimationPhase === 'bottom' || cardAnimationPhase === 'bottom-bounce-up') ? 'bottom left' : 'center',
                            zIndex: index,
                            transition: getTransition(cardAnimationPhase)
                        }}
                    >
                        {/* Card content */}
                        <div className="w-full h-full relative">
                            {/* Top-left corner */}
                            <div
                                className={`absolute top-1 left-1.5 text-sm leading-none ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                <div className="font-bold">{card.rank}</div>
                                <div className="text-base">{card.suit}</div>
                            </div>

                            {/* Center suit */}
                            <div
                                className={`absolute inset-0 flex items-center justify-center text-3xl ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                {card.suit}
                            </div>

                            {/* Bottom-right corner (upside down) */}
                            <div
                                className={`absolute bottom-1 right-1.5 text-sm leading-none transform rotate-180 ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
                                <div className="font-bold">{card.rank}</div>
                                <div className="text-base">{card.suit}</div>
                            </div>
                        </div>
                    </div>))}
                </div>

                {/* Waiting Text */}
                <div className="text-white text-lg mb-6 flex items-center justify-center gap-1">
                    <span>Waiting for others to join</span>
                    <span className="w-8 text-left">{waitingDots}</span>
                </div>

                {/* Cancel Button */}
                <button
                    onClick={handleCancelWaiting}
                    className="bg-gray-400 hover:bg-gray-500 text-white px-6 py-2 rounded-lg transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>);
    };

    const handleCancelWaiting = () => {
        setIsWaiting(false);
        if (socket) {
            socket.send(JSON.stringify({
                type: "exit_queue", name: playerName
            }));
            socket.close();
            setSocket(null);
        }
        console.log("Cancelled waiting");
    };

    const handleJoinGame = (playerName, avatar, num_players, game_mode) => {
        console.log("WelcomePage: Joining game with:", playerName, avatar, num_players, game_mode);

        setIsWaiting(true);
        console.log("Set isWaiting to true");

        const ws = new WebSocket("ws://localhost:5050/ws");
        setSocket(ws);

        ws.onopen = () => {
            console.log("WebSocket connected in WelcomePage");
            ws.send(JSON.stringify({
                type: "player_join", name: playerName, avatar: avatar, num_players: num_players, game_mode: game_mode
            }));
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            console.log("WelcomePage received:", msg);

            if (msg.type === 'new_round') {
                console.log("Game starting! Passing to CheatGame...");
                setIsWaiting(false);

                // Remove all event listeners from this WebSocket
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;

                // Pass the socket and initial data to App.js, which will pass to CheatGame
                onGameStart(ws, msg);
            }

            // Handle other queue-related messages if needed
            if (msg.type === 'queue_update') {
                console.log(`Queue update: ${msg.message}`);
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error in WelcomePage:", error);
            setIsWaiting(false);
        };

        ws.onclose = (event) => {
            console.log("WebSocket closed in WelcomePage:", event.code, event.reason);
            if (isWaiting) {
                setIsWaiting(false); // Only hide if we're still waiting
            }
        };
    };

    useEffect(() => {

        // Draw the logo
        const drawingTimer = setTimeout(() => {
            setShowSubtitle(true);
        }, 800);

        // Move the logo up and add subtitles
        const movingTimer = setTimeout(() => {
            setAnimationPhase('moving');
        }, 2000)

        // Add the subtitles
        const subtitleTimer = setTimeout(() => {
            setAnimationPhase('buttons-visible');
        }, 3000);

        return () => {
            clearTimeout(subtitleTimer);
            clearTimeout(movingTimer);
            clearTimeout(drawingTimer);
        };
    }, []);

    const handleNewGameClick = () => {
        setAnimationPhase('form-visible');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (playerName.trim() && selectedAvatar && acceptedTerms) {
            handleJoinGame(playerName.trim(), selectedAvatar, numPlayers, gameMode);
        }
    };

    if (isWaiting) {
        return <LoadingWindow handleCancelWaiting={handleCancelWaiting}/>
    }
    return (<div
        className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="relative w-full max-w-md h-96 mx-auto">

            {/* Logo Container */}
            <div className={`
                    w-full flex flex-col items-center
                    transition-all duration-1000 ease-in-out
                    ${animationPhase === 'drawing' ? 'translate-y-1/4 transform' : animationPhase === 'form-visible' ? '-translate-y-full' : ''}
                `}>
                <div className="w-full max-w-md">
                    <Logo
                        className="mx-auto"
                        style={{width: "80%", height: "auto"}}
                        animationDuration="1.5s"
                    />
                </div>

                {/* Subtitle */}
                <div className={`
                        mt-1 transition-all duration-500 ease-in-out
                        ${showSubtitle ? 'opacity-100 h-auto' : 'opacity-0 h-auto'}
                    `}>
                    <p className="text-white text-xl md:text-2xl opacity-100 text-center">
                        The classic bluffing card game
                    </p>
                </div>
            </div>

            <div className={`flex gap-4 w-full justify-center lex-col mt-4 transition-opacity
                ${animationPhase === 'moving' ? 'opacity-100 duration-700 delay-200' : animationPhase === 'buttons-visible' ? 'duration-500' : 'opacity-0'} `}>
                <button
                    onClick={handleNewGameClick}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg"
                >
                    New Game
                </button>
                <button
                    onClick={() => alert('Tutorial coming soon!')}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg"
                >
                    Tutorial
                </button>
            </div>


            {/* Welcome Box, slides in when New Game is clicked */}
            <div className={`
                    w-full max-w-md mt-10 pb-10
                    transition-all ease-in-out transform z-50
                    ${animationPhase === 'form-visible' ? 'opacity-100 mt-5 drop-shadow-lg' : 'opacity-0 transform'}
                    ${animationPhase === 'form-visible' ? 'flex-1 justify-start -translate-y-1/3' : 'flex-0'}
                `} style={{transitionDuration: '1100ms'}}>

                {animationPhase === 'form-visible' && (
                    <div className="rounded-2xl bg-white p-8 max-w-md w-full shadow-2xl">

                        {/* Close Button */}
                        <button
                            onClick={() => setAnimationPhase('buttons-visible')}
                            className="absolute top-1 right-1 text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            <svg className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors m-1 p-1"
                                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>

                        <form onSubmit={handleSubmit}>
                            {/* Player Name Input */}
                            <div className="mb-6 mt-3">
                                <input
                                    type="text"
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    placeholder="Choose a player name ..."
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    maxLength={20}
                                    required
                                />
                            </div>

                            {/* Avatar Selection */}
                            <div className="mb-6">
                                <label className="block text-gray-500 text-sm font-bold mb-4">
                                    Choose your Avatar
                                </label>
                                <div
                                    className="overflow-x-auto scrollbar-thin border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <div className="flex gap-3" style={{minWidth: 'min-content'}}>
                                        {AVATARS.map((avatar, index) => (<button
                                            key={index}
                                            type="button"
                                            onClick={() => setSelectedAvatar(avatar)}
                                            className={`flex-shrink-0 text-4xl p-3 rounded-xl transform-gpu transition-transform ${selectedAvatar === avatar ? 'bg-blue-500 text-white scale-110 ring-4 ring-blue-300' : 'bg-gray-100 hover:bg-gray-200 hover:scale-110'}`}
                                        >
                                            {avatar}
                                        </button>))}
                                    </div>
                                </div>
                            </div>

                            {/* Game mode selection */}
                            <div className="mb-6">
                                <label className="block text-gray-500 text-sm font-bold mb-4">
                                    <span className="flex items-center gap-2">Game Mode

                                      <button
                                          onClick={() => setShowGameModeHelp(!showGameModeHelp)}
                                          className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs hover:bg-gray-300 transition-colors"
                                      >
                                          ?
                                      </button>
                                        {/* Help Tooltip */}
                                        {showGameModeHelp && (<div
                                            className="mb-3 p-3 absolute left-1/3 font-medium transition-all w-1/2 bg-blue-200 bg-opacity-50 backdrop-blur-lg rounded-lg text-sm text-gray-700">
                                            In <strong>Single Player</strong> all opponents are bots;
                                            in <strong>Multiplayer</strong> some opponents are human.
                                        </div>)}
                                    </span>
                                </label>


                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setGameMode('single')}
                                        className={`px-6 py-3 rounded-lg transition-colors ${gameMode === 'single' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700'}`}
                                    >
                                        Single Player
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setGameMode('multiplayer')}
                                        className={`px-6 py-3 rounded-lg transition-colors ${gameMode === 'multiplayer' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                    >
                                        Multiplayer
                                    </button>
                                </div>
                            </div>

                            {/* Number of players */}
                            <div className="mb-6">
                                <label className="block text-gray-500 text-sm font-bold mb-4">
                                    <span className="flex items-center gap-2">Number of Players

                                      <button
                                          onClick={() => setShowNumPlayersHelp(!showNumPlayersHelp)}
                                          className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs hover:bg-gray-300 transition-colors"
                                      >
                                          ?
                                      </button>
                                        {/* Help Tooltip */}
                                        {showNumPlayersHelp && (<div
                                            className="mb-3 p-3 absolute left-1/2 font-medium transition-all w-1/2 bg-blue-200 bg-opacity-50 backdrop-blur-lg rounded-lg text-sm text-gray-700">
                                            In Multiplayer mode, at most 3 players will be human and at least one player
                                            will be a bot.
                                        </div>)}
                                    </span>
                                </label>
                                <div className="flex gap-2">
                                    {[3, 4, 5, 6].map((count) => (<button
                                        key={count}
                                        type="button"
                                        onClick={() => setNumPlayers(count)}
                                        className={`flex-1 py-3 rounded-lg transition-colors ${numPlayers === count ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                    >
                                        {count}
                                    </button>))}
                                </div>
                            </div>

                            {/* Terms and Conditions Checkbox */}
                            <div className="mb-6">

                                <label className="flex items-start space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={acceptedTerms}
                                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                                        className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                        required
                                    />
                                    <span className="text-sm text-gray-700">
                                            I consent that anonymised game play data will be collected for research purposes only. Click {' '}
                                        <button
                                            type="button"
                                            onClick={() => alert(`Anonymised play data will be stored for research purposes.`)}
                                            className="text-blue-600 hover:text-blue-800 underline focus:outline-none"
                                        >
                                                here
                                            </button> for details.
                                        </span>
                                </label>
                            </div>

                            {/* Join Button */}
                            <button
                                type="submit"
                                disabled={!playerName.trim() || !selectedAvatar || !acceptedTerms}
                                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                                text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
                            >
                                Join Game
                            </button>
                        </form>
                    </div>)}
            </div>
        </div>
    </div>);
};

export default WelcomePage;