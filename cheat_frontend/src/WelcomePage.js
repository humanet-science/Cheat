// WelcomePage.js
import React, {useState, useEffect} from 'react';
import {Logo} from './utils/Logo';
import {AVATARS} from "./utils/constants";

const WelcomePage = ({onJoinGame}) => {
	const [playerName, setPlayerName] = useState('');
	const [selectedAvatar, setSelectedAvatar] = useState('');
	const [acceptedTerms, setAcceptedTerms] = useState(false);
	const [animationPhase, setAnimationPhase] = useState('drawing'); // 'drawing' | 'moving-up' | 'form-visible'
	const [showSubtitle, setShowSubtitle] = useState(false); // Separate state for subtitle

	useEffect(() => {

		// Subtitle appears 1 second into logo animation
		const subtitleTimer = setTimeout(() => {
			setShowSubtitle(true);
		}, 800);

		// Logo drawing completes after 2.5 seconds
		const drawingTimer = setTimeout(() => {
			setAnimationPhase('moving-up');
		}, 2000);

		// Form appears 0.5 seconds after drawing completes
		const formTimer = setTimeout(() => {
			setAnimationPhase('form-visible');
		}, 2500);

		return () => {
			clearTimeout(subtitleTimer);
			clearTimeout(drawingTimer);
			clearTimeout(formTimer);
		};
	}, []);

	const handleSubmit = (e) => {
		e.preventDefault();
		if (playerName.trim() && selectedAvatar && acceptedTerms) {
			onJoinGame(playerName.trim(), selectedAvatar);
		}
	};

	return (<div
		className="min-h-screen bg-gradient-to-br from-green-900 to-blue-900 flex flex-col items-center justify-center p-4">

		<div className="relative w-full max-w-md h-96 mx-auto">

			{/* Logo Container - Fixed position that doesn't move */}
			<div className={`
					w-full flex flex-col items-center
					transition-all duration-1000 ease-in-out
					${animationPhase === 'drawing' ? 'absolute top-1/4 left-1/2 transform -translate-x-1/2' // Centered
				: animationPhase === 'moving-up' ? 'absolute top-1/4 left-1/2 transform -translate-x-1/2'   // Moving to top
					: 'absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full'   // Final top position
			}
				`}>
				{/* Logo - Always the same size and position */}
				<div className="w-full max-w-md"> {/* Fixed container size */}
					<Logo
						className="mx-auto"
						style={{
							width: "80%", height: "auto",
						}}
						animationDuration="1.5s"
					/>
				</div>

				{/* Subtitle - Appears below logo without affecting its position */}
				<div className={`
						mt-1 transition-all duration-500 ease-in-out
						${showSubtitle ? 'opacity-100 h-auto' : 'opacity-0 h-auto'}
					`}>
					<p className="text-white text-xl md:text-2xl opacity-100 text-center">
						The classic bluffing card game
					</p>
				</div>
			</div>


			{/* Welcome Box - Slides in smoothly */}
			<div className={`
					 w-full max-w-md mt-auto mb-8
					transition-all ease-in-out transform z-10
					${animationPhase === 'form-visible' ? 'opacity-100 absolute top-5 mt-5 left-1/2 transform -translate-x-1/2 -translate-y-0 drop-shadow-lg'  // Visible and in position
				: 'opacity-0 absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-1/3'    // Hidden and slightly below
			}
					${animationPhase === 'form-visible' ? 'flex-1 justify-start' : 'flex-0'}
				`} style={{transitionDuration: '1100ms'}}>
				{animationPhase === 'form-visible' && (<div className="rounded-2xl bg-white p-8 max-w-md w-full shadow-2xl">
					<form onSubmit={handleSubmit}>
						{/* Player Name Input */}
						<div className="mb-6">
							<input
								type="text"
								value={playerName}
								onChange={(e) => setPlayerName(e.target.value)}
								placeholder="Enter your name..."
								className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								maxLength={20}
								required
							/>
						</div>

						{/* Avatar Selection */}
						<div className="mb-6">
							<label className="block text-gray-500 text-sm font-bold mb-4">
								Choose Your Avatar
							</label>
							<div className="h-40 overflow-y-auto scrollbar-thin border border-gray-200 rounded-lg p-3 bg-gray-50">
								<div className="grid grid-cols-4 gap-3">
									{AVATARS.map((avatar, index) => (<button
										key={index}
										type="button"
										onClick={() => setSelectedAvatar(avatar)}
										className={`text-4xl p-3 rounded-xl transform-gpu transition-transform ${selectedAvatar === avatar ? 'bg-blue-500 text-white scale-110 ring-4 ring-blue-300' : 'bg-gray-100 hover:bg-gray-200 hover:scale-110'}`}
									>
										{avatar}
									</button>))}
								</div>
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
							className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
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