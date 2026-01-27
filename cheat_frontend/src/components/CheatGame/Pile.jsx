import React from "react";

export function CenterPile({isMyTurn, hasActed, pileCards, lastPlayedCount, dealingCards = [], playerPositions = {}}) {
	return (
		<div className="fixed left-1/2 top-1/2 z-20" style={{transform: "translate(-50%, -50%)"}}>

			{/* Dealing animation - cards appear and fly to players */}
			{dealingCards.map((card) => {
				const target = playerPositions[card.targetPlayer];
				if (!target) return null;

				// Random offset from center to simulate hand movement
				const startOffsetX = Math.random() * 40 - 20; // -20 to 20px
				const startOffsetY = Math.random() * 40 - 20;
				return (
					<div
						key={card.id}
						className="absolute w-12 h-16 rounded bg-blue-600 border-2 border-white pointer-events-none"
						style={{
							opacity: 0,
							animation: `dealCardFlick 0.6s ease-out forwards`,
							animationDelay: `${card.delay}ms`,
							'--start-offset-x': `${startOffsetX}px`,
							'--start-offset-y': `${startOffsetY}px`,
							'--target-x': `${target.x}px`,
							'--target-y': `${target.y}px`,
							'--target-rotation': `${Math.random() * 360}deg`,
						}}
					/>
				);
			})}

			{/* Regular pile cards */}
			{pileCards.map((card, index) => {
				const isRecentlyPlayed = index >= pileCards.length - lastPlayedCount && isMyTurn && !hasActed;
				return (
					<div
						key={card.id}
						className={`absolute w-12 h-16 rounded bg-blue-600 border-2 shadow-lg transition-all ${
							isRecentlyPlayed ? 'border-red-500 border-4 shadow-red-500/50' : 'border-white'
						}`}
						style={{
							transform: `translate(${card.offsetX}px, ${card.offsetY}px) rotate(${card.rotation}deg)`,
						}}
					/>
				);
			})}
		</div>
	);
}