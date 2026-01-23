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

	// Tutorial
	const [showTutorial, setShowTutorial] = useState(false);

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

		// Create websocket
		const getWebSocketURL = () => {
			const hostname = window.location.hostname;

			// If accessing via localhost, connect to localhost
			if (hostname === 'localhost' || hostname === '127.0.0.1') {
				return 'ws://localhost:5050/ws';
			}

			// If accessing via IP, connect to that IP
			return `ws://${hostname}:5050/ws`;
		};
		const ws = new WebSocket(getWebSocketURL());
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
		className="min-h-screen flex flex-col items-center justify-center p-4" id="game-root">
		<div className="relative w-full max-w-md h-96 mx-auto z-10">

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
						animationDuration="4s"
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
					onClick={() => setShowTutorial(true)}
					className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg"
				>
					Tutorial
				</button>
			</div>

			{showTutorial && (<Tutorial onClose={() => setShowTutorial(false)}/>)}


			{/* Welcome Box, slides in when New Game is clicked */}
			<div className={`
                    w-full max-w-md mt-10 pb-10
                    transition-all ease-in-out transform z-10
                    ${animationPhase === 'form-visible' ? 'opacity-100 mt-5 drop-shadow-lg' : 'opacity-0 transform'}
                    ${animationPhase === 'form-visible' ? 'flex-1 justify-start -translate-y-1/3' : 'flex-0'}
                `} style={{transitionDuration: '1100ms'}}>

				{animationPhase === 'form-visible' && (<div className="rounded-2xl bg-white p-8 max-w-md w-full shadow-2xl">

					{/* Close Button */}
					<button
						onClick={() => setAnimationPhase('buttons-visible')}
						className="absolute top-1 right-1 text-gray-500 hover:text-gray-700 transition-colors"
						type="button"
					>
						<svg className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors m-1 p-1"
								 fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>

					<form onSubmit={handleSubmit}>

						{/* Player Name Input */}
						<PlayerNameInput playerName={playerName} setPlayerName={setPlayerName} />

						{/* Avatar Selection */}
						<AvatarSelection
							selectedAvatar={selectedAvatar}
							setSelectedAvatar={setSelectedAvatar}/>

						{/* Game mode selection */}
						<div className="mb-6">
							<div className="flex items-center gap-2 mb-4"> {/* Changed from label to div */}
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


							<div className="flex gap-4 relative">
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
							In Multiplayer mode, at most 3 players will be human and at least one player
							will be a bot.
						</div>)}

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
							Join Game
						</button>
					</form>
				</div>)}
			</div>
		</div>
	</div>);
};

export default WelcomePage;