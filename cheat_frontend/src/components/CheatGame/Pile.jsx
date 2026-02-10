import React from "react";

export function CenterPile({isMyTurn, hasActed, pileCards, lastPlayedCount, tableCenter}) {

	return (

			<div className="fixed z-20"
					 style={{left: `calc(50% + ${tableCenter.x}px)`,
                    top: `calc(50% + ${tableCenter.y}px)`,
                    transform: "translate(-50%, -50%)"}}>

			{/* Regular pile cards */}
			{pileCards.map((card, index) => {
				const isRecentlyPlayed = index >= pileCards.length - lastPlayedCount && isMyTurn && !hasActed;
				return (
					<div
						key={card.id}
						className={`absolute w-[clamp(30px,min(5.66vw,8.3vh),45.3px)] h-[clamp(45px,min(8.5vw,12.6vh),68px)] rounded bg-blue-600 border-2 shadow-lg transition-all ${
							isRecentlyPlayed ? 'border-red-500 border-[3px] shadow-red-500/50' : 'border-white'
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
