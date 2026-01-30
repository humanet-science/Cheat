import React from "react";

/**
 * PlayerHand component displays the user's cards and play controls, as well as the player's message sending
 * functionality.
 *
 * @param isMyTurn
 * @param hasActed
 * @param isNewRound
 * @param showRankInput
 * @param experimentalMode
 * @param rankError
 * @param selectedCards
 * @param state
 * @param sendMessage
 * @param play
 * @param setDeclaredRank
 * @param messageInput
 * @param allowedMessages
 * @param declaredRank
 * @param parseCard
 * @param toggleCard
 * @param setMessageInput
 * @returns {JSX.Element}
 * @constructor
 */
export default function PlayerHand({
																		 isMyTurn,
																		 hasActed,
																		 isNewRound,
																		 showRankInput,
																		 experimentalMode,
																		 rankError,
																		 selectedCards,
																		 state,
																		 sendMessage,
																		 play,
																		 setDeclaredRank,
																		 messageInput,
																		 allowedMessages,
																		 declaredRank,
																		 parseCard,
																		 toggleCard,
																		 setMessageInput,
																		 playerPositions,
																		 yourId,
																		 pileCards,
																		 callBluff,
																		 isDealingCards,
																		 dealtCardsCount
																	 }) {
	return (<div style={{
		position: 'fixed',
		left: `calc(50% + ${playerPositions[yourId]?.x || 0}px)`,
		top: `calc(50% + ${playerPositions[yourId]?.y || 0}px)`,
		transform: 'translate(-50%, -50%)'
	}}
							 className="z-30"
							 id={`player-${yourId}`}
	>
		<div className="flex justify-center">
			<div>
				<div className="text-center mb-3">
					<div className="text-lg font-semibold">
						<span className="ml-3 text-yellow-400">{isMyTurn ? 'Your Turn' : ''}</span>
					</div>
				</div>

				{/* Cards */}
				<div className="flex justify-center items-end mb-4"
						 style={{paddingLeft: '2rem', paddingRight: '2rem'}}>
					{state.your_info.hand.map((card, index) => {
						const {rank, suit, isRed} = parseCard(card);
						return (<button
							key={`${card}-${index}`}
							onClick={() => toggleCard(card)}
							disabled={!isMyTurn || hasActed || (selectedCards.length >= 3 && !selectedCards.includes(card))}
							style={{
								marginLeft: index === 0 ? '0' : '-1.5rem', // Add dealing animation
								opacity: isDealingCards && index >= dealtCardsCount ? 0 : 1,
								transform: isDealingCards && index >= dealtCardsCount ? 'translateY(20px) scale(0.8)' : selectedCards.includes(card) ? 'translateY(-1rem) scale(1)' : 'translateY(0) scale(1)',
								transition: `all 0.3s ease-out ${isDealingCards ? `${index * 0.15}s` : '0s'}`
							}}
							className={`relative w-16 h-24 rounded-lg border-2 font-bold ${selectedCards.includes(card) ? "bg-yellow-400 border-yellow-500 shadow-xl" : "bg-white border-gray-400 shadow-md"} ${isMyTurn && !hasActed && (selectedCards.length < 3 || selectedCards.includes(card)) ? "hover:shadow-lg hover:-translate-y-2 cursor-pointer" : !isMyTurn || hasActed ? "cursor-not-allowed" : "bg-gray-400 cursor-not-allowed"}`}
						>
							{/* Top-left corner */}
							<div
								className={`absolute top-1 left-1.5 text-sm leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div>{rank}</div>
								<div className="text-base">{suit}</div>
							</div>

							{/* Center suit */}
							<div
								className={`absolute inset-0 flex items-center justify-center text-3xl ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								{suit}
							</div>

							{/* Bottom-right corner (upside down) */}
							<div
								className={`absolute bottom-1 right-1.5 text-sm leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div>{rank}</div>
								<div className="text-base">{suit}</div>
							</div>
						</button>);
					})}
				</div>

				{/* Play Controls / Message Input with Morphing Effect */}
				<div className={`relative flex items-center justify-center gap-4
												transition-all duration-500 ease-in-out
												${isMyTurn && !hasActed ? 'h-12 scale-100' : 'h-12 scale-95'}
										`}>
					{/* Background bubble that morphs */}
					<div className={`
														absolute inset-0 rounded-2xl
														transition-all duration-500 ease-in-out
														${isMyTurn && !hasActed ? 'scale-100' : 'scale-100'}
												`}>

					</div>

					{/* Communication and Play controls */}
					<div className="min-w-fit relative z-10 flex items-center gap-4 transition-all duration-500">

						{/* Message input */}
						{!allowedMessages ? (<div className="flex items-center gap-3 animate-fadeIn relative">
							<input
								type="text"
								placeholder="Send a message..."
								value={messageInput}
								onChange={(e) => setMessageInput(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
								className={`px-4 py-1 rounded-xl backdrop-blur-lg bg-white bg-opacity-30 text-gray-950 text-center font-medium text-lg
																				transition-all duration-500 focus:outline-none focus:bg-opacity-80 ${messageInput ? 'bg-opacity-80' : 'bg-opacity-30'}`}
							/>
							{messageInput && (<button
								onClick={() => sendMessage()}
								disabled={!messageInput.trim()}
								className={`absolute right-1 px-1 py-1 rounded-full font-bold text-white transition-all bg-blue-500 hover:bg-blue-400 duration-300 transform scale-[0.8] shadow-lg'}`}
							>
								<img
									src="/icons/arrow_up.svg"
									alt="Arrow up"
									className="w-4 h-4 m-1"
									style={{
										filter: 'drop-shadow(0 0 0.2px white) drop-shadow(0 0 0.2px white) drop-shadow(0 0 0.2px white)'
									}}
								/>
							</button>)}
						</div>) : (<div className="flex flex-col gap-1">
							<div className="flex gap-2">
								{allowedMessages.slice(0, Math.ceil(allowedMessages.length / 2)).map((msg, index) => (<button
									key={index}
									onClick={() => sendMessage(msg)}
									className="px-2 py-0.5 rounded-full bg-amber-50 hover:bg-white backdrop-blur-lg opacity-50
																				text-gray-950 font-semibold text-sm transition-all duration-300 hover:opacity-75 hover:scale-110 active:scale-95 whitespace-nowrap"
								>
									{msg}
								</button>))}
							</div>
							<div className="flex gap-1 justify-center">
								{allowedMessages.slice(Math.ceil(allowedMessages.length / 2),).map((msg, index) => (<button
									key={index + 6}
									onClick={() => sendMessage(msg)}
									className="px-2 py-0.5 rounded-full bg-amber-50 hover:bg-white backdrop-blur-lg opacity-50 text-gray-950 font-semibold
																				text-sm transition-all duration-200 hover:scale-110 active:scale-95 whitespace-nowrap"
								>
									{msg}
								</button>))}
							</div>
						</div>)}

						{/* Play controls */}
						{isMyTurn && !hasActed && (
							<div className="relative flex items-center gap-4 animate-fadeIn min-w-fit whitespace-nowrap">

								{showRankInput ? (<div>
									<input
										type="text"
										placeholder="Declare rank (e.g. 7)"
										value={declaredRank}
										onChange={(e) => {
											setDeclaredRank(e.target.value.toUpperCase())
										}}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												// Only play if cards are actually selected AND rank is valid
												if (selectedCards.length > 0) {
													play();
												} else {
													// Optional: Show some feedback that cards need to be selected
													console.log("Cannot play - no cards selected");
												}
											}
										}}
										className={`
																								min-w-fit whitespace-nowrap relative px-1 py-1 rounded-xl border-2 bg-blue-900 text-white text-center font-bold
																								transition-all duration-300 transform focus:outline-none 
																								${rankError ? 'animate-wiggle border-red-500 bg-red-500 scale-105' : 'border-yellow-400'}
																						`}
									/> {!(selectedCards.length === 0 || selectedCards.length > 3 || (isNewRound && !declaredRank)) && (
									<button
										onClick={play}
										className={`
																						absolute top-1/2 -translate-y-1/2 right-1 px-1 py-1 rounded-full transition-all duration-300 transform scale-[0.8]
																						${selectedCards.length === 0 || (isNewRound && !declaredRank) ? 'bg-gray-600 cursor-not-allowed scale-95' : 'bg-green-600 hover:bg-green-500 shadow-lg'}
																				`}
									>
										<img
											src="/icons/arrow_up.svg"
											alt="Arrow up"
											className="w-4 h-4 m-1"
											style={{
												filter: 'drop-shadow(0 0 0.2px white) drop-shadow(0 0 0.2px white) drop-shadow(0 0 0.2px white)'
											}}
										/>
									</button>)}
								</div>) : (<button
									onClick={play}
									disabled={selectedCards.length === 0 || selectedCards.length > 3 || (isNewRound && !declaredRank)}
									className={`
																						px-4 py-2 rounded-xl font-bold text-white transition-all duration-300 transform
																						${selectedCards.length === 0 || (isNewRound && !declaredRank) ? 'bg-gray-600 cursor-not-allowed scale-95' : 'bg-green-600 hover:bg-green-500 hover:scale-105 active:scale-95 shadow-lg'}
																				`}
								>
									Play {selectedCards.length} Card{selectedCards.length !== 1 ? "s" : ""}
								</button>)}

							</div>)}


						{/* Call Bluff button */}
						{isMyTurn && pileCards.length > 0 && state.current_rank && !hasActed && (
							<div className="pop-in flex items-center gap-4">
								<button
									onClick={callBluff}
									className="bg-red-600 hover:bg-red-700 transition-all duration-300 transform hover:scale-105 active:scale-95 text-white font-bold py-2 px-4 rounded-xl"
								>
									Call!
								</button>
							</div>)}
					</div>
				</div>
			</div>
		</div>
	</div>)
}