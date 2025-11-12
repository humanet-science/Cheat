import React from "react";
import {getPlayerPositions} from "../../utils/cardUtils"

export function OpponentIcons({opponents, handlePlayerClick, state, getPlayerColor}) {

	const totalPlayers = opponents.length + 1; // +1 for the human player
	const playerPositions = getPlayerPositions(totalPlayers);

	return (opponents.map((opp, index) => {

		// Get the player position
		const position = playerPositions[index + 1];

		return (<div
			key={opp.id}
			id={`player-${opp.id}`}
			style={{
				position: 'absolute',
				left: `calc(50% + ${position.x}px)`,
				top: `calc(50% + ${position.y}px)`,
				transform: 'translate(-50%, -50%)',
			}}
			className={`player-opponent rounded-full z-10 p-4 w-24 h-24 border-2 ${getPlayerColor(opp.id)} ${state.current_player === opp.id ? "border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.9)]" : ""} cursor-pointer transition-all duration-200 group`}
			onClick={() => handlePlayerClick(opp)}
		>
			<div className="text-center flex flex-col items-center justify-center h-full relative">
				{/* Curved player name */}
				<svg width="200" height="100" viewBox="0 0 200 80"
						 className="absolute left-1/2 -top-12 transform -translate-x-1/2">
					<defs>
						{/* Move arc higher to accommodate larger text */}
						<path id={`nameArc-${opp.id}`} d="M 40,60 A 25,20 0 1,1 160,60" fill="transparent"/>
					</defs>
					<text className="text-lg fill-white font-semibold">
						<textPath href={`#nameArc-${opp.id}`} startOffset="50%" textAnchor="middle">
							{opp.name.length > 15 ? `${opp.name.substring(0, 15)}...` : opp.name}
						</textPath>
					</text>
				</svg>
				{/* Avatar in center */}
				<span className="text-5xl z-10 relative group-hover:scale-110 transition-all">{opp.avatar}</span>
			</div>

			{/* Card icons for each opponent */}
			<div
				key={`debug-card-${opp.id}0`}
				className="opponent-card-1 absolute drop-shadow-xl z-10 w-12 h-16 bg-blue-800 border-0 border-white
                            rounded shadow-lg text-xs flex items-center justify-center transition-all"
				style={{transform: 'translate(-10%, -2%) rotate(-6deg)'}}
			></div>
			<div
				key={`debug-card-${opp.id}1`}
				className="opponent-card-2 transition-all absolute drop-shadow-xl z-20 w-12 h-16 bg-blue-700 border-0 border-white rounded shadow-lg text-xs flex items-center justify-center"
				style={{
					transform: 'translate(10%, -3%) rotate(-3deg)',
				}}
			></div>
			{/* Display number of cards on each hand */}
			<div
				key={`debug-card-${opp.id}2`}
				className="opponent-card-3 transition-all absolute drop-shadow-xl z-30 w-12 h-16 bg-blue-600 border-0 border-white rounded shadow-lg text-xs flex items-center justify-center"
				style={{
					transform: 'translate(30%, -4%)',
				}}
			>
				<div className="text-center flex flex-col items-center justify-center h-full">
					<div className="text-2xl font-bold">{opp.cardCount}</div>
					<div className="text-xs opacity-75">cards</div>
				</div>
			</div>
		</div>);
	}))
}