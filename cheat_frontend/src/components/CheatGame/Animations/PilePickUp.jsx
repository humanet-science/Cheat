import React from "react";

/** Animation of cards being picked up from the pile
 *
 * @param pilePickupAnimation
 * @returns {JSX.Element|null}
 * @constructor
 */
export default function PilePickUpAnimation({pilePickupAnimation}) {
	if (!pilePickupAnimation) return null;
	return (<div className="absolute z-0 pointer-events-none" style={{left: '50%', top: '50%', zIndex: 0}}>
		{pilePickupAnimation.cards.map((card, i) => (<div
			key={`pickup-${card.id}`}
			className="absolute w-12 h-16 z-0 bg-blue-600 rounded border-2 border-white shadow-lg"
			style={{
				animation: `cardPickup 0.5s ease-out forwards`,
				animationDelay: `${i * 0.05}s`,
				'--start-x': `${card.offsetX}px`,
				'--start-y': `${card.offsetY}px`,
				'--start-rotation': `${card.rotation}deg`,
				'--target-x': `${pilePickupAnimation.targetX}px`,
				'--target-y': `${pilePickupAnimation.targetY}px`
			}}
		/>))}
	</div>)
}
