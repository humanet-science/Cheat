import React, {useState} from "react";

export function OpponentIcons({
																opponents, playerPositions, handlePlayerClick, state, playAnnouncements, getPlayerColor,
															}) {

	const [hoveredPlayer, setHoveredPlayer] = useState(null);

	return (opponents.map((opp, index) => {

		return (
			<div
				key={opp.id}
				id={`player-${opp.id}`}
				style={{
					position: 'absolute',
					left: `calc(50% + ${playerPositions[opp.id]?.x || 0}px)`,
					top: `calc(50% + ${playerPositions[opp.id]?.y || 0}px)`,
					transform: 'translate(-50%, -50%)',
				}}
				className={`player-opponent rounded-full z-10 p-4 w-[clamp(50px,7vw,80px)] h-[clamp(50px,7vw,80px)] border-2 ${getPlayerColor(opp.id)} ${state.current_player === opp.id ? "border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.9)]" : ""} cursor-pointer transition-all duration-200 group`}
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
						<text className="text-s md:text-sm lg:text-lg fill-white font-semibold">
							<textPath href={`#nameArc-${opp.id}`} startOffset="50%" textAnchor="middle">
								{opp.name.length > 15 ? `${opp.name.substring(0, 15)}...` : opp.name}
							</textPath>
						</text>
					</svg>
					{/* Avatar in center */}
					<span
						className="text-[clamp(20px,4vw,50px)] z-10 relative group-hover:scale-110 transition-all">{opp.avatar}</span>
				</div>

				{/* Card icons for each opponent */}
				<div
					key={`debug-card-${opp.id}0`}
					className="opponent-card-1 transition-all absolute drop-shadow-xl z-10 w-[clamp(30px,min(5.66vw,8.3vh),45.3px)] h-[clamp(45px,min(8vw,12vh),68px)] bg-blue-800 border-0 border-white rounded shadow-lg text-xs flex items-center justify-center"
					style={{transform: 'translate(-10%, -2%) rotate(-6deg)'}}
				></div>
				<div
					key={`debug-card-${opp.id}1`}
					className="opponent-card-2 transition-all absolute drop-shadow-xl z-20 w-[clamp(30px,min(5.66vw,8.3vh),45.3px)] h-[clamp(45px,min(8vw,12vh),68px)] bg-blue-700 border-0 border-white rounded shadow-lg text-xs flex items-center justify-center"
					style={{
						transform: 'translate(10%, -3%) rotate(-3deg)',
					}}
				></div>
				{/* Display number of cards on each hand */}
				<div
					key={`debug-card-${opp.id}2`}
					className="opponent-card-3 transition-all absolute drop-shadow-xl z-30 w-[clamp(30px,min(5.66vw,8.3vh),45.3px)] h-[clamp(45px,min(8vw,12vh),68px)] bg-blue-600 border-0 border-white rounded shadow-lg text-xs flex items-center justify-center"
					style={{
						transform: 'translate(30%, -4%)',
					}}
				>
					<div className="text-center flex flex-col items-center justify-center h-full leading-none">
						<div className="text-lg md:text-xl lg:text-2xl font-bold leading-none">{opp.cardCount}</div>
						<div className="opacity-75 hidden sm:block leading-none"
								 style={{fontSize: 'min(1.1vw, 1rem)'}}>card{opp.cardCount === 1 ? '' : 's'}</div>
					</div>
				</div>

				<div
					className="relative"
					onMouseEnter={() => setHoveredPlayer(opp.id)}
					onMouseLeave={() => setHoveredPlayer(null)}
				>
					{playAnnouncements.filter(msg => msg.playerId === opp.id).map((msg, i, arr) => {

						const offset = (arr.length - 1 - i) * 35;
						const offsetX = i !== arr.length - 1 ? 40 : 30;
						const isHovered = hoveredPlayer === opp.id;

						// Determine if opponent is on the right side of the screen
						const isRightSide = (playerPositions[opp.id]?.x || 0) > 0;

						// Position announcements pointing inward
						const baseOffsetX = isRightSide ? -10 : 10;
						const hoverOffsetX = i !== arr.length - 1 ? (isRightSide ? -40 : 40) : (isRightSide ? -30 : 30);

						return (<div
							key={`small-${msg.id}`}
							className={`
								absolute backdrop-blur-lg drop-shadow-xl rounded-2xl p-1 sm:p-2 bg-amber-200
								${i !== arr.length - 1 ? 'bg-opacity-low' : 'bg-opacity-high'} text-[0.6rem] sm:text-xs
								play-announcement-small transition-all duration-300`
							}
							style={{
								bottom: '50%',
								[isRightSide ? 'right' : 'left']: '90%',
								zIndex: 40 + i,
								transform: `translate(${isHovered ? hoverOffsetX : baseOffsetX}px, ${isHovered ? offset : -10 * i}px)`,
							}}
						>
							<div className="text-white justify-end flex items-center gap-1">
								<svg
									width="12"
									viewBox="0 0 256 256"
									className="opacity-80 flex-shrink-0 aspect-square"
								>
									<path
										fill="currentColor"
										d="M116.3,10.4c-24.6,2.7-48.4,13.2-67,29.8c-2.4,2.2-4.6,3.9-4.9,3.9s-8.1-7.6-17.4-17l-17-17v50.5v50.5h50.5H111L89.6,89.7L68.3,68.3l2.6-2.4C83,55.2,96.9,48.2,112.5,45.1c7.6-1.5,22.7-1.7,30.2-0.3c17.7,3.3,32.7,11.2,45.1,23.6c22.6,22.6,30.5,55.6,20.5,86.1c-9.4,28.6-34.1,50.3-64.4,56.4c-8.5,1.7-22.8,1.7-31.3,0c-22.5-4.5-42-17.5-54.5-36.1l-3.1-4.5l-14.2,8.2c-7.8,4.5-14.3,8.3-14.5,8.5c-0.5,0.5,7.2,11.9,11.6,17.1c35.3,41.6,94.1,53.8,142.8,29.6c34.7-17.2,58.5-50,64.4-88.8c1.3-8.3,1.3-25.4,0-33.8c-8-51.9-48-92.1-99.5-99.9C138.7,10.1,122.7,9.7,116.3,10.4z"
									/>
								</svg>
								<div className="font-semibold whitespace-nowrap">{msg.message}</div>
							</div>
						</div>);
					})}
				</div>
			</div>);
	}))
}
