// WelcomePage.js
import React, {useEffect, useState} from 'react';
import {Logo} from './utils/Logo';
import LoadingWindow from "./components/GameLoading";
import Tutorial from "./components/Tutorial";
import {PlayerNameInput, AvatarSelection, TermsCheckbox} from "./components/WelcomeBox";

const WelcomePage = ({onGameStart}) => {

    // Logo and welcome box animation
    const [animationPhase, setAnimationPhase] = useState('drawing'); // 'drawing' | 'buttons-visible' | 'form-visible'
    const [showSubtitle, setShowSubtitle] = useState(false);

    // Currently active tab in the 'New Game' window
    const [activeTab, setActiveTab] = useState('quick'); // 'quick' or 'create'

    // Show the tutorial
    const [showTutorial, setShowTutorial] = useState(false);

    // Number of human and bot players selected (dynamic game creation)
    const [numHumans, setNumHumans] = useState(3);
    const [numBots, setNumBots] = useState(1);

    // Is the Creator of the game (and is thus the only person that can cancel it)
    const [isGameCreator, setIsGameCreator] = useState(false);

    // Form to join an existing game
    const [showJoinForm, setShowJoinForm] = useState(false);
    const [gameKey, setGameKey] = useState('');

    // Error when joining game (game is full or key invalid)
    const [joinError, setJoinError] = useState('');

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

    // Number of humans waiting in queue for specific game
    const [numHumansWaiting, setNumHumansWaiting] = useState(1);

    // Game cancelled notification
    const [showGameCancelled, setShowGameCancelled] = useState(false);

    // Socket
    const [socket, setSocket] = useState(null);

    // Screen is in landscape mode
    const [isLandscape, setIsLandscape] = useState(window.innerHeight < 600);

    // Clear the error from the game key input button when the input changes
    const handleGameKeyChange = (e) => {
        setGameKey(e.target.value);
        setJoinError('');
    };

    useEffect(() => {
        const handleResize = () => {
            setIsLandscape(window.innerHeight < 600);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Slider for the number of humans in the game when creating a custom game
    const handleHumansChange = (value) => {
        const newHumans = Number(value);
        setNumHumans(newHumans);

        // Adjust bots if current value exceeds new max
        const maxBots = 6 - newHumans;
        const minBots = Math.max(0, 3 - newHumans);
        if (numBots > maxBots) {
            setNumBots(maxBots);
        } else if (numBots < minBots) {
            setNumBots(minBots);
        }
    };

    // For game creation: calculate dynamic padding for bot slider based on number of options.
    // Minimum 3 players, maximum 6 players. Minimum number of humans = 2
    const numBotOptions = numHumans === 2 ? (6 - numHumans) : (6 - numHumans) + 1;
    const botPadding = numBotOptions === 1 ? 82 : (5 - numBotOptions) * 10;

    // Exit the waiting queue
    const handleCancelWaiting = () => {
        setIsWaiting(false);
        if (socket) {
            socket.send(JSON.stringify({
                type: "exit_queue",
                name: playerName
            }));
            console.log("Sent cancel signal.");
        }
    };

    // Join or create a game
    const handleNewJoinGame = (
        playerName,
        avatar,
        create_game = false,
        num_players = null,
        num_humans = null,
        num_bots = null,
        game_mode = null,
        game_key = null) => {

        console.log("WelcomePage: ", playerName, "is joining.");

        // Create websocket
        const getWebSocketURL = () => {
            const hostname = window.location.hostname;

            // If accessing via localhost, connect to localhost
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'ws://localhost:5050/ws';
            }

            // For production, use secure WebSocket without port
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${hostname}/ws`;
        };
        const ws = new WebSocket(getWebSocketURL());
        setSocket(ws);

        // Send the initial message
        ws.onopen = () => {
            console.log("WebSocket connected in WelcomePage");
            if (create_game) {
                ws.send(JSON.stringify({
                    type: "create_game",
                    name: playerName,
                    avatar: avatar,
                    num_humans: num_humans,
                    num_bots: num_bots,
                }));
            } else {
                ws.send(JSON.stringify({
                    type: "player_join",
                    name: playerName,
                    avatar: avatar,
                    num_players: num_players,
                    game_mode: game_mode,
                    ...(game_key && {game_key: game_key})
                }));
            }
        };

        // If player is creator of game, set state
        if (create_game) {
            setIsGameCreator(true);
            console.log('Set Game Creator true');
            setNumHumans(num_humans);
        }

        // Listen for incoming messages
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            console.log("WelcomePage received:", msg);

            // Game commencing
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

            // Game created and key returned
            else if (msg.type === 'game_created') {
                setIsWaiting(true);
                setGameKey(msg.key);
            }

            // Game cancelled
            else if (msg.type === 'game_cancelled') {
                if (msg?.is_creator) {
                    // If creator cancels game, reset flag
                    setIsGameCreator(false);
                } else {
                    // Notify non-creator players in queue that game has been cancelled
                    setShowGameCancelled(true);
                }
                if (socket) {
                    socket.close();
                }
                setSocket(null);
                setNumHumansWaiting(1);
                setGameKey('');
            }

            // Confirmed quit
            else if (msg.type === 'quit_confirmed') {
                if (socket) {
                    socket.close();
                }
                setSocket(null);
                setNumHumansWaiting(1);
            }

            // Non-creating player has exited the queue
            else if (msg.type === 'player_exited_queue') {
                setNumHumansWaiting(numHumansWaiting - 1);
            }

            // Errors when trying to join a game: invalid game_key or game already in progress
            else if (msg.type === 'invalid_key') {
                setJoinError(msg.message);
                setIsWaiting(false);
            }

            // Player joined the queue for a specific game
            else if (msg.type === 'queue_joined') {
                setNumHumansWaiting(msg.num_connected);
                setNumHumans(msg.num_slots);
                setIsWaiting(true);
            }

            // Player waiting for enough people to fill game
            else {
                setIsWaiting(true);
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error in WelcomePage:", error);
            setIsWaiting(false);
        };

        ws.onclose = (event) => {
            console.log("WebSocket closed in WelcomePage:", event.code, event.reason);
            setIsWaiting(false);
        };
    };

    // When clicking on 'New Game', show the corresponding menu
    const handleNewGameClick = () => {
        setAnimationPhase('form-visible');
        setShowJoinForm(false);
    };

    // When clicking on 'Join game', show corresponding menu
    const handleJoinGameClick = () => {
        setAnimationPhase('form-visible');
        setShowJoinForm(true);
    };

    // Only allow clicking on the submit button if name, avatar, and T&Cs have been supplied;
    const handleSubmit = (e) => {
        e.preventDefault();
        if (playerName.trim() && selectedAvatar && acceptedTerms) {
            if (activeTab === 'create' && !showJoinForm) {
                handleNewJoinGame(playerName.trim(), selectedAvatar, true, null, numHumans, numBots);
            } else {
                handleNewJoinGame(playerName.trim(), selectedAvatar, false, numPlayers, null, null, gameMode, gameKey);
            }
        }
    };

    // Logo and input box animation
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

    if (isWaiting) {
        return (<>
            <LoadingWindow
                handleCancelWaiting={handleCancelWaiting}
                gameKey={gameKey}
                joinedHumans={numHumansWaiting}
                totalSlots={numHumans}
                isGameCreator={isGameCreator}
            />

            {/* Game cancelled notification */}
            {showGameCancelled && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-70">
                    <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 relative">
                        <h2 className="text-2xl font-bold text-center text-gray-700 mb-4">Game Cancelled</h2>
                        <p className="text-gray-500 mb-6 text-center">
                            The game has been cancelled by the creator.
                        </p>
                        <button
                            onClick={() => {
                                setShowGameCancelled(false);
                                setIsWaiting(false);
                                setAnimationPhase('form-visible');
                            }}
                            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg transition-colors font-semibold"
                        >
                            Back to Menu
                        </button>
                    </div>
                </div>
            )}
        </>)
    }
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4"
             id="game-root">

            {/* Tutorial */}
            {showTutorial && (<Tutorial onClose={() => setShowTutorial(false)}/>)}

            {/* Logo and join buttons */}
            <div className={`relative mx-auto z-10`}>

                {/* Logo Container */}
                <div className={`
                    w-full flex flex-col items-center
                    transition-all duration-1000 ease-in-out
                    ${animationPhase === 'drawing' ? 'translate-y-1/4 transform' : ''}
                `}>
                    <div className="w-full max-w-md">
                        <Logo
                            className="mx-auto"
                            style={{width: "80%", height: "auto"}}
                            animationDuration="4s"
                            animated={animationPhase === 'drawing'}
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

                {/* Join buttons */}
                <div className={`flex flex-col sm:flex-row gap-4 w-full justify-center mt-4 sm:px-0 px-6 transition-opacity
                ${animationPhase === 'moving' ? 'opacity-100 duration-700 delay-200' : animationPhase === 'buttons-visible' ? 'duration-500' : 'opacity-0'} `}>
                    <button
                        onClick={handleNewGameClick}
                        className="drop-shadow-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap bg-gradient-to-br from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-all text-lg"
                    >
                        <img src="/icons/plus_icon.svg" className="w-6 h-6" alt=""/>New Game
                    </button>
                    <button
                        onClick={handleJoinGameClick}
                        className="drop-shadow-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap bg-gradient-to-br from-orange-400 to-pink-400 hover:from-orange-500 hover:to-pink-500 text-white font-bold py-3 px-6 rounded-lg transition-colors text-lg"
                    >
                        <img src="/icons/link_icon.svg" className="w-6 h-6" alt=""/>Join Game
                    </button>
                    <button
                        onClick={() => setShowTutorial(true)}
                        className="drop-shadow-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap bg-gradient-to-br from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-white font-bold py-3 px-5 rounded-lg transition-colors text-lg"
                    >
                        <img src="/icons/book_icon.svg" className="w-6 h-6 mx-1" alt=""/>How to play
                    </button>
                </div>
            </div>


            {/* Welcome box container */}
            {/* The welcome box centers when it fits the screen, and aligns to the top when the screen is too short*/}
            <div className={`
                    fixed inset-0 flex items-center justify-center p-4
                    pointer-events-none z-10
                    transition-opacity duration-400
                    ${animationPhase === 'form-visible' ? 'opacity-100' : 'opacity-0'}
                `} style={{transitionDuration: '400ms'}}>

                <div className={`
                    w-full ${isLandscape ? 'max-w-3xl' : 'max-w-md'}
                    max-h-full overflow-y-auto
                    pointer-events-auto
                    transition-all ease-in-out transform
                    ${animationPhase === 'form-visible' ? 'scale-100' : 'scale-95'}
                `} style={{transitionDuration: '400ms'}}>

                {/* New Game form*/}
                {animationPhase === 'form-visible' && !showJoinForm && (

                    <div className={`rounded-2xl bg-white ${isLandscape ? '' : 'max-w-md'} w-full shadow-2xl`}>

                        {/* Top row: Tabs and Close Button */}
                        <div className="pl-8 pr-2 flex items-center justify-between pt-2">
                            {/* Tab Navigation */}
                            <div className="flex w-full border-b border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('quick')}
                                    className={`flex-1 py-3 text-center transition-colors ${activeTab === 'quick' ? 'text-blue-600 border-b-2 border-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Quick Pairing
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('create')}
                                    className={`flex-1 w-full py-3 text-center transition-colors ${activeTab === 'create' ? 'text-blue-600 border-b-2 border-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Create Game
                                </button>
                            </div>
                            {/* Close Button */}
                            <button
                                onClick={() => setAnimationPhase('buttons-visible')}
                                className="text-gray-500 hover:text-gray-700 transition-colors -mt-6 -mr-1"
                                type="button"
                            >
                                <svg
                                    className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors m-1 p-1"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>


                        <form onSubmit={handleSubmit} className="p-8 pt-4">
                            <div className={`grid ${isLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1'}`}>
                                <div className={isLandscape ? 'border-r border-gray-200 pr-6' : ''}>

                                    {/* Player Name Input */}
                                    <PlayerNameInput playerName={playerName} setPlayerName={setPlayerName}/>

                                    {/* Avatar Selection */}
                                    <AvatarSelection
                                        selectedAvatar={selectedAvatar}
                                        setSelectedAvatar={setSelectedAvatar}/>
                                </div>
                                <div>
                                    {/* Quick Pairing Tab */}
                                    {activeTab === 'quick' && (<>
                                        {/* Game mode selection */}
                                        <div className="mb-6">
                                            <div
                                                className="flex items-center gap-2 mb-4"> {/* Changed from label to div */}
                                                <label className="block text-gray-500 text-sm font-bold">
                                                    Game Mode
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowGameModeHelp(!showGameModeHelp)}
                                                    className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-xs hover:bg-gray-300 transition-colors flex-shrink-0"
                                                >
                                                    ?
                                                </button>
                                            </div>


                                            <div className="flex gap-4 relative whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => setGameMode('single')}
                                                    className={`px-5 py-3 rounded-lg transition-colors ${gameMode === 'single' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700'}`}
                                                >
                                                    Single Player
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setGameMode('multiplayer')}
                                                    className={`px-5 py-3 rounded-lg transition-colors ${gameMode === 'multiplayer' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                                >
                                                    Multiplayer
                                                </button>
                                            </div>
                                        </div>
                                        {/* Help Tooltip */}
                                        {showGameModeHelp && (<div
                                            className="mb-3 p-3 absolute top-1/3 left-1/3 font-medium transition-all w-1/2 bg-blue-200 bg-opacity-50 backdrop-blur-lg rounded-lg text-sm text-gray-700 pointer-events-none">
                                            In <strong>Single Player</strong> all opponents are bots;
                                            in <strong>Multiplayer</strong> some opponents are human.
                                        </div>)}

                                        {/* Number of players */}
                                        <div className="mb-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <label className="block text-gray-500 text-sm font-bold">
                                                    Number of Players
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNumPlayersHelp(!showNumPlayersHelp)}
                                                    className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-xs hover:bg-gray-300 transition-colors flex-shrink-0"
                                                >
                                                    ?
                                                </button>
                                            </div>
                                            <div className="flex gap-2 relative">
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

                                        {/* Help Tooltip */}
                                        {showNumPlayersHelp && (<div
                                            className="mb-3 p-3 absolute left-[45%] top-1/2 font-medium transition-all w-1/2 bg-blue-200 bg-opacity-50 backdrop-blur-lg rounded-lg text-sm text-gray-700 pointer-events-none">
                                            In Multiplayer mode, at most 3 players will be human and at least one
                                            player
                                            will be a bot.
                                        </div>)}
                                    </>)}

                                    {activeTab === 'create' && (<>
                                        {/* Player Configuration - Side by Side */}
                                        <div className="mb-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Humans Slider */}
                                                <div>
                                                    <label
                                                        className="block text-gray-500 text-sm font-bold mb-0 text-center">
                                                        Humans: {numHumans}
                                                    </label>
                                                    <div className="px-2.5">
                                                        <input
                                                            type="range"
                                                            min="2"
                                                            max="6"
                                                            step="1"
                                                            value={numHumans}
                                                            onChange={(e) => handleHumansChange(e.target.value)}
                                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                        /></div>
                                                    <div className="flex text-xs text-gray-500 mt-2 px-0">
                                                        {[2, 3, 4, 5, 6].map(n => (
                                                            <span key={n}
                                                                  className="flex-1 text-center">{n}</span>))}
                                                    </div>
                                                </div>

                                                {/* Bots Slider */}
                                                <div>
                                                    <label
                                                        className="block text-gray-500 text-sm font-bold mb-0 text-center">
                                                        Bots: {numBots}
                                                    </label>
                                                    <div style={{
                                                        paddingLeft: `${botPadding}px`,
                                                        paddingRight: `${botPadding}px`
                                                    }}>
                                                        <input
                                                            type="range"
                                                            min={Math.max(0, 3 - numHumans)}
                                                            max={6 - numHumans}
                                                            step="1"
                                                            value={numBots}
                                                            onChange={(e) => setNumBots(Number(e.target.value))}
                                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                        /></div>
                                                    <div
                                                        className="flex justify-between text-xs text-gray-500 mt-2">
                                                        {Array.from({length: numBotOptions}, (_, i) => i + Math.max(0, 3 - numHumans)).map(n => (
                                                            <span key={n}
                                                                  className="flex-1 text-center">{n}</span>))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Total Players Display */}
                                        <div className="mb-6 p-3 bg-blue-50 rounded-lg text-center">
                                            <p className="text-sm text-gray-700">
                                                Total Players: <span
                                                className="font-bold text-blue-600">{numHumans + numBots}</span>
                                            </p>
                                        </div>
                                    </>)}</div>
                            </div>


                            {/* Terms and Conditions Checkbox */}
                            <TermsCheckbox
                                acceptedTerms={acceptedTerms}
                                setAcceptedTerms={setAcceptedTerms}/>

                            {/* Join Button */}
                            <button
                                type="submit"
                                disabled={!playerName.trim() || !selectedAvatar || !acceptedTerms}
                                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                                text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
                            >
                                {activeTab === 'quick' ? 'Start Game' : 'Create Game'}
                            </button>
                        </form>
                    </div>)}

                {/* New Game form*/}
                {animationPhase === 'form-visible' && showJoinForm && (

                    <div className={`rounded-2xl bg-white ${isLandscape ? '' : 'max-w-md'} w-full shadow-2xl`}>

                        <button
                            onClick={() => setAnimationPhase('buttons-visible')}
                            className="absolute right-1 top-1 text-gray-500 hover:text-gray-700 transition-colors"
                            type="button"
                        >
                            <svg
                                className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors m-1 p-1"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>


                        <form onSubmit={handleSubmit} className="p-8">
                            <div className={`grid ${isLandscape ? 'grid-cols-2 gap-6' : 'grid-cols-1'}`}>
                                <div className={isLandscape ? 'border-r border-gray-200 pr-6' : ''}>
                                    {/* Player Name Input */}
                                    <PlayerNameInput playerName={playerName} setPlayerName={setPlayerName}/>

                                    {/* Avatar Selection */}
                                    <AvatarSelection
                                        selectedAvatar={selectedAvatar}
                                        setSelectedAvatar={setSelectedAvatar}/>
                                </div>
                                <div>
                                    {/* Terms and Conditions Checkbox */}
                                    <TermsCheckbox
                                        acceptedTerms={acceptedTerms}
                                        setAcceptedTerms={setAcceptedTerms}/>

                                    {/* Game Key Input and Button - Side by Side */}
                                    <div className="mb-6">
                                        <label className="block text-gray-500 text-sm font-bold mb-2">
                                            Game Key
                                        </label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative">
                                                <input
                                                    type="text"
                                                    placeholder="Enter game key ..."
                                                    value={gameKey}
                                                    onChange={handleGameKeyChange}
                                                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${
                                                        joinError
                                                            ? 'border-red-500 focus:ring-red-500 focus:border-red-500 pr-10'
                                                            : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                                                    }`}
                                                    maxLength={16}
                                                    required
                                                />

                                                {/* Error icon positioned inside input */}
                                                {joinError && (
                                                    <div
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 text-xs">
                                                        {joinError}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={!playerName.trim() || !selectedAvatar || !gameKey.trim() || !acceptedTerms}
                                                className="px-8 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors whitespace-nowrap"
                                            >
                                                Join
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>)}
                </div></div>
        </div>);
};

export default WelcomePage;
