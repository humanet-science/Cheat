import React from "react";

export function CenterPile({isMyTurn, hasActed, pileCards, lastPlayedCount}) {
	return (<div className="fixed left-1/2 top-1/2 z-20" style={{transform: "translate(-50%, -50%)"}}>

		{/* Cards on pile*/}
		{pileCards.map((card, index) => {
			const isRecentlyPlayed = index >= pileCards.length - lastPlayedCount && isMyTurn && !hasActed;
			return (<div
				key={card.id}
				className={`absolute w-12 h-16 rounded bg-blue-600 border-2 shadow-lg transition-all ${isRecentlyPlayed ? 'border-red-500 border-4 shadow-red-500/50' : 'border-white'}`}
				style={{
					transform: `translate(${card.offsetX}px, ${card.offsetY}px) rotate(${card.rotation}deg)`,
				}}
			/>);
		})}
	</div>)
}