import React from "react";

/** Animates cards flying to the pile
 *
 * @param animatingCards
 * @returns {JSX.Element|null}
 * @constructor
 */
export default function CardFlyAnimation({animatingCards, tableCenter}) {
	if (!animatingCards) return null;
	return (<div className="absolute z-20 pointer-events-none"
							 style={{
								 left: `calc(50% + ${tableCenter.x}px)`,
								 top: `calc(50% + ${tableCenter.y}px)`,
								 transform: "translate(-50%, -50%)"
							 }}>
		{animatingCards.cards.map((card, i) => (<div
			key={i}
			className="absolute w-[clamp(30px,min(5.66vw,8.3vh),45.3px)] h-[clamp(45px,min(8.5vw,12.6vh),68px)] bg-blue-600 rounded border-2 border-white shadow-lg"
			style={{
				animation: `cardFlyIndividual 0.6s ease-out forwards`,
				animationDelay: `${i * 0.05}s`,
				'--start-x': `${animatingCards.x}px`,
				'--start-y': `${animatingCards.y}px`,
				'--start-rotation': `${card.startRotation}deg`,
				'--end-x': `${card.offsetX}px`,
				'--end-y': `${card.offsetY}px`,
				'--end-rotation': `${card.rotation}deg`
			}}
		/>))}
	</div>);
}
