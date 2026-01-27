import React from "react";

/**
 *
 * @param discards
 * @returns {JSX.Element|null}
 * @constructor
 */
export default function DiscardAnimation({discards}) {
	if (discards.length === 0) return null;
	return (<div className="fixed top-4 right-4 rounded-lg p-4 z-0 max-w-lg">
		<div className="text-sm font-bold mb-3 opacity-75 flex justify-end">Discarded Sets</div>
		<div className="flex flex-wrap justify-end gap-3">
			{discards.map((rank, setIndex) => (<div
				key={setIndex}
				className="relative"
				style={{
					animation: 'popIn_cards 0.5s ease-out'
				}}
			>
				{/* Show 4 overlapping cards for each set */}
				<div className="relative h-20" style={{width: '60px', marginRight: '20px'}}>
					{['♠', '♥', '♣', '♦'].map((suit, cardIndex) => {
						const isRed = suit === '♥' || suit === '♦';
						return (<div
							key={cardIndex}
							className="absolute w-12 h-16 bg-gray-200 drop-shadow-xl rounded border border-gray-300 shadow-md"
							style={{
								left: `${cardIndex * 10}px`,
								top: 0,
								zIndex: cardIndex,
								animation: `cardPop 0.3s ease-out ${cardIndex * 0.1}s both`
							}}
						>
							{/* Top-left corner */}
							<div
								className={`absolute top-0.5 left-1 text-xs leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div className="font-bold">{rank}</div>
								<div className="text-sm">{suit}</div>
							</div>

							{/* Center suit */}
							<div
								className={`absolute inset-0 flex items-center justify-center text-xl ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								{suit}
							</div>

							{/* Bottom-right corner */}
							<div
								className={`absolute bottom-0.5 right-1 text-xs leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div className="font-bold">{rank}</div>
								<div className="text-sm">{suit}</div>
							</div>
						</div>);
					})}

				</div>
			</div>))}
		</div>
	</div>)
}