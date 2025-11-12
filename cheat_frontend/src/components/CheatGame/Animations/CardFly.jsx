import React from "react";

/** Animates cards flying to the pile
 *
 * @param animatingCards
 * @returns {JSX.Element|null}
 * @constructor
 */
export default function CardFlyAnimation({animatingCards}) {
	if (!animatingCards) return null;
	return (<div className="absolute z-20 pointer-events-none" style={{left: '50%', top: '50%'}}>
		{animatingCards.cards.map((card, i) => (<div
			key={i}
			className="absolute w-12 h-16 bg-blue-600 rounded border-2 border-white shadow-lg"
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
