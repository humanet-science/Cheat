import React from "react";

export function CenterPile({isMyTurn, state, hasActed, pileCards, lastPlayedCount, callBluff}) {
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

		{/* Call Bluff Button */}
		{isMyTurn && pileCards.length > 0 && state.current_rank && !hasActed && (
			<div className="absolute top-full left-1/2 pop-in" style={{transform: 'translateX(-50%)'}}>
				<button
					onClick={callBluff}
					className="w-full drop-shadow-[0_0px_40px_rgba(0,0,0,1)] bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6
                            rounded-lg transition-colors"
				>
					Call!
				</button>
			</div>)}
	</div>)
}