import React, { useState, useEffect } from "react";

/** Animates the card reveal on top the pile (i.e. the result of a call)
 *
 * @param revealedCards
 * @param parseCard
 * @param state
 * @returns {JSX.Element|null}
 * @constructor
 */
export function CardRevealOverlay({revealedCards, parseCard, state}) {
	if (!revealedCards) return null;
	return (<div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60]">
		<div
			className="text-center bg-opacity-80 backdrop-blur-md rounded-2xl p-6 border-2 border-white border-opacity-20 shadow-2xl">
			{/* Dramatic result text */}
			<div
				className="text-5xl font-bold mb-4 satisfy-regular whitespace-nowrap"
				style={{
					animation: 'dramaticZoom 0.8s ease-out',
					color: revealedCards.wasLying ? '#ef4444' : '#9BE9B7',
					filter: revealedCards.wasLying ? 'drop-shadow(0 0 30px rgba(239, 68, 68, 1.0))' : 'drop-shadow(0 0 50px rgba(34, 197, 94, 0.8))'
				}}
			>
				{revealedCards.wasLying ? '🎭 Busted!' : "No lies detected!"}
			</div>

			{/* Player info */}
			<div className="text-2xl mb-6 text-white drop-shadow-lg whitespace-nowrap">
				{revealedCards.accused === state.your_info.id ? "You" : `${revealedCards.accused_name}`} played:
			</div>

			{/* Cards - only show if they were lying */}
			{(<div className="flex justify-center gap-6 perspective-1000">
				{revealedCards.cards.map((card, i) => {
					const {rank, suit, isRed} = parseCard(card);
					return (<div
						key={i}
						className="relative"
						style={{
							animation: `cardFlipReveal 1s ease-out ${i * 0.15}s both`
						}}
					>
						{/* Card back (shows first during flip) */}
						<div
							className="absolute inset-0 w-20 h-28 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg border-4 border-white shadow-2xl"
							style={{
								backfaceVisibility: 'hidden', animation: `cardFlipOut 1s ease-out ${i * 0.15}s both`
							}}
						>
							<div className="absolute inset-2 border-2 border-blue-400 rounded"></div>
						</div>

						{/* Card front (reveals after flip) */}
						<div
							className={`w-20 h-28 bg-white rounded-lg border-4 border-gray-400 shadow-2xl relative`}
							style={{
								backfaceVisibility: 'hidden', animation: `cardFlipIn 1s ease-out ${i * 0.15}s both`
							}}
						>
							{/* Top-left corner */}
							<div
								className={`absolute top-1 left-2 text-sm leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div className="font-bold text-lg">{rank}{suit}</div>
							</div>

							{/* Center suit */}
							<div
								className={`absolute inset-0 flex items-center justify-center text-5xl ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								{suit}
							</div>

							{/* Bottom-right corner */}
							<div
								className={`absolute bottom-1 right-2 text-sm leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div className="font-bold text-lg">{rank}{suit}</div>
							</div>
						</div>
					</div>);
				})}
			</div>)}

			<div className="text-2xl mt-6 mb-2 text-white drop-shadow-lg whitespace-nowrap">
				{revealedCards.wasLying && revealedCards.accused === state.your_info.id ? "You pick" : revealedCards.wasLying ? `${revealedCards.accused_name} picks` : revealedCards.caller === state.your_info.id ? 'You pick' : `${revealedCards.caller_name} picks`} up the
					pile.
			</div>

		</div>
	</div>)
}

export function GameOverOverlay({
																	gameOver,
																	winner,
																	state,
																	ws,
																	setGameOver,
																	setWinner,
																	setSelectedCards,
																	setDeclaredRank,
																	setHasActed,
																	setPileCards,
																	setActionQueue,
																	setIsNewRound,
																	setDiscards,
																	onQuit,
																	countdown,
																	confirmedCount,
																	totalHumans,
																	setPlayAnnouncements,
																	experimentalMode,
																	experimentOver,
																	hasClickedNextRound,
																	setHasClickedNextRound,
																	onFinish,
																}) {
	if (!gameOver) return null;
	return (<div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40">
		<div
			className="text-center text-5xl items-center justify-center bg-opacity-80 backdrop-blur-sm rounded-2xl p-6 border-2 border-white border-opacity-20 shadow-2xl">
			<div className="mb-2 satisfy-regular">
				{winner === state.your_info.name ? "🎉 You win! 🎉" : `${winner} wins!`}
			</div>

			{/* Show countdown and player count */}
			{((countdown !== null && countdown <= 15) || (confirmedCount > 0)) && (<div className="mb-2 text-sm ">
				<div className="text-sm text-red-200">
					Exiting in {countdown}s
				</div>
				{confirmedCount > 0 && (<div className="mb-4 text-grey-200">
					{confirmedCount}/{totalHumans} players ready
				</div>)}
			</div>)}

			<div className={`${experimentalMode ? '' : 'flex'}  gap-4`}>

				{/* Next round option if not in experimental mode or if experiment has not yet finished */}
				{((!experimentalMode) || (experimentalMode && !experimentOver)) && (<div className="flex flex-col items-center gap-2">
					<button
						disabled={hasClickedNextRound}
						onClick={() => {
							ws.send(JSON.stringify({type: "new_round"}));
							if (totalHumans > 1) {
								ws.send(JSON.stringify({type: "human_message", message: "Player joined", sender_id: state.your_info.id}));
							}
							setSelectedCards([]);     // clear any lingering selections
							setDeclaredRank("");      // reset the rank box
							setHasActed(false);       // reset action flag
							setPileCards([]);
							setActionQueue([]);
							setIsNewRound(true);
							setDiscards([]);
							setPlayAnnouncements([]);
							setHasClickedNextRound(true);
						}}
						className={`${hasClickedNextRound ? 'bg-gray-500 cursor-not-allowed text-gray-400' : 'bg-green-600 hover:bg-green-700 text-white '} font-bold py-2 px-6 rounded-lg text-lg whitespace-nowrap`}
					>
						Next Round
					</button>
					{hasClickedNextRound && experimentalMode && (
						<div className="text-sm text-gray-300 whitespace-nowrap">
							Waiting for the other participants<span className="dot-bounce"><span>.</span><span>.</span><span>.</span></span>
						</div>
					)}
				</div>)}

				{/* In Experimental mode: if experiment finished, set finish and mark player complete */}
				{experimentalMode && experimentOver && (<button
					onClick={onFinish}
					className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl text-lg whitespace-nowrap"
				>
					Finish
				</button>)}

				{/* Quit button: only available outside the experimental mode*/}
				{!experimentalMode && (<button
					onClick={() => {
						onQuit();
					}}
					className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg transition-colors text-lg whitespace-nowrap"
				>
					Leave Game
				</button>)}
			</div>
		</div>
	</div>)
}

export function ConnectionDroppedOverlay({connectionDropped, isReconnecting, showReconnected}) {
	// Delay showing the spinner badge so instant reconnects don't cause a flash,
	// but the transparent click-blocker appears immediately (isReconnecting is set
	// at the very start of the reconnect attempt).
	const [showSpinner, setShowSpinner] = useState(false);
	useEffect(() => {
		if (!isReconnecting) { setShowSpinner(false); return; }
		const t = setTimeout(() => setShowSpinner(true), 600);
		return () => clearTimeout(t);
	}, [isReconnecting]);

	if (!connectionDropped && !isReconnecting && !showReconnected) return null;

	if (showReconnected) {
		return (
			<div className="fixed bottom-4 right-4 z-[70] flex items-center gap-2 bg-green-600 bg-opacity-95 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
				<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				Reconnected
			</div>
		);
	}

	if (isReconnecting) {
		return (
			<>
				{/* Transparent blocker: appears immediately so the user can't play while offline */}
				<div className="fixed inset-0 z-[69]" />
				{showSpinner && (
					<div className="fixed bottom-4 right-4 z-[70] flex items-center gap-2 bg-gray-900 bg-opacity-90 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
						<svg className="animate-spin w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
							<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
						</svg>
						Reconnecting...
					</div>
				)}
			</>
		);
	}

	return (
		<div className="fixed inset-0 flex items-center justify-center z-[70] bg-black bg-opacity-60 backdrop-blur-sm">
			<div className="text-center bg-white rounded-2xl p-8 shadow-2xl">
				<div className="text-5xl mb-4">⚠️</div>
				<div className="text-2xl font-bold text-gray-900 mb-3">Connection lost</div>
				<div className="text-lg text-gray-600 mb-6">Please contact the experimenter.</div>
				<button
					onClick={() => { window.location.href = '/'; }}
					className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg text-lg"
				>
					Home
				</button>
			</div>
		</div>
	);
}

export function GameStartOverlay({showLetsGo}) {
	if (!showLetsGo) return null
	return (
		(<div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
			<div
				className="animate-fadeIn text-center bg-opacity-80 backdrop-blur-sm rounded-2xl
					p-6 border-2 border-white border-opacity-20 shadow-2xl"
				style={{
					animation: 'fadeInOut 2.5s ease-in-out',
				}}
			>
				<div className="text-white text-6xl font-bold satisfy-regular "
					style={{
						filter: 'drop-shadow(0 0 30px rgba(256, 256, 256, 0.8))'
					}}
				>
					Let's Gooo!
				</div>
			</div>
		</div>)
	)
}
