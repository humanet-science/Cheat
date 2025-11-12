import React from "react";

/** Animates the card reveal on top the pile (i.e. the result of a call)
 *
 * @param revealedCards
 * @param parseCard
 * @param state
 * @returns {JSX.Element|null}
 * @constructor
 */
export default function CardRevealOverlay({revealedCards, parseCard, state}) {
	if (!revealedCards) return null;
	return (
		<div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40">
			<div
				className="text-center bg-opacity-80 backdrop-blur-sm rounded-2xl p-8 border-2 border-white border-opacity-20 shadow-2xl">
				{/* Dramatic result text */}
				<div
					className="text-5xl font-bold mb-4 satisfy-regular"
					style={{
						animation: 'dramaticZoom 0.8s ease-out',
						color: revealedCards.wasLying ? '#ef4444' : '#9BE9B7',
						textShadow: revealedCards.wasLying
							? '0 0 50px #ef4444'
							: '0 0 50px rgba(34, 197, 94, 0.8)'
					}}
				>
					{revealedCards.wasLying ? '🎭 Busted!' : "No lies detected!"}
				</div>

				{/* Player info */}
				<div className="text-2xl mb-6 text-white drop-shadow-lg">
					{revealedCards.wasLying ? (
						<p className="mb-2">
							{revealedCards.accused === state.your_id ? "You" : `${revealedCards.accused_name}`} played:
						</p>
					) : (
						<p className="mb-2">
							{revealedCards.caller === state.your_id ? "You pick" : `${revealedCards.caller_name} picks`} up the
							pile.
						</p>
					)}
				</div>

				{/* Cards - only show if they were lying */}
				{revealedCards.wasLying && (
					<div className="flex justify-center gap-6 perspective-1000">
						{revealedCards.cards.map((card, i) => {
							const {rank, suit, isRed} = parseCard(card);
							return (
								<div
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
											backfaceVisibility: 'hidden',
											animation: `cardFlipOut 1s ease-out ${i * 0.15}s both`
										}}
									>
										<div className="absolute inset-2 border-2 border-blue-400 rounded"></div>
									</div>

									{/* Card front (reveals after flip) */}
									<div
										className="w-20 h-28 bg-white rounded-lg border-4 border-red-400 shadow-2xl relative"
										style={{
											backfaceVisibility: 'hidden',
											animation: `cardFlipIn 1s ease-out ${i * 0.15}s both`
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
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	)
}