import React from "react";
import {CARD_DEAL_INTERVAL, CARD_FLIGHT_TIME} from "../../utils/constants";

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
																	 }) {


	return (<div
		style={{
			position: 'absolute',
			left: `calc(50% + ${playerPositions[yourId]?.x || 0}px)`,
			top: `calc(50% + ${playerPositions[yourId]?.y || 0}px)`,
			transform: 'translate(-50%, -50%)'
		}}
		className="z-30 transition-all duration-200 ease-in-out" id={`player-${yourId}`}
	>
		<div className="flex justify-center">
			<div className="w-full">
				<div className="text-center mb-[1%]">
					<div className="text-lg font-semibold">
						<span className="ml-3 text-yellow-400">{isMyTurn ? 'Your Turn' : ''}</span>
					</div>
				</div>

				{/* Cards */}
				<div className="flex justify-center mb-4">
					<div className="flex w-fit justify-center items-end mb-[0%] pl-[2%] pr-[2%]" id="self-cards">
						{state.your_info.hand.map((card, index) => {
							const {rank, suit, isRed} = parseCard(card);
							const numCards = state.your_info.hand.length;
							const vw = window.innerWidth;
							const vh = window.innerHeight;
							const cardWidth = Math.min(68, Math.max(45, Math.min(vw * 0.085, vh * 0.125)));
							const cardHeight = Math.max(56, Math.min(vw * 0.112, vh * 0.168, 96));

							// Calculate overlap to fit cards in available width
							const calculateOverlap = () => {
								// Match clamp
								const availableWidth = vw * 0.85; // Leave margins

								// How much space would cards take with no overlap?
								const totalWidthNoOverlap = numCards * cardWidth;

								// How much do we need to compress?
								const compressionNeeded = totalWidthNoOverlap - availableWidth;

								// Divide by number of gaps between cards
								const overlapPerCard = compressionNeeded / (numCards - 1);

								// Convert pixels to rem (16px = 1rem) and clamp
								const overlapRem = -Math.max(1.6, Math.min(2.5, overlapPerCard / 16));

								return `${overlapRem}rem`;
							};

							const cardDealDelay = (index * state.players.length + state.your_info.id) * CARD_DEAL_INTERVAL;

							return (<button
								key={`${card}-${index}`}
								onClick={() => toggleCard(card)}
								disabled={!isMyTurn || hasActed || (selectedCards.length >= 3 && !selectedCards.includes(card))}
								style={{
									marginLeft: index === 0 ? '0' : calculateOverlap(),
									opacity: isDealingCards ? 0 : 1,
									transform: isDealingCards ? 'translateY(20px) scale(0.8)' : selectedCards.includes(card) ? 'translateY(-1rem) scale(1)' : 'translateY(0) scale(1)',
									animation: isDealingCards
										? `cardAppear ${CARD_FLIGHT_TIME / 1000}s ease-out ${cardDealDelay / 1000}s forwards`
										: 'none',
									transition: isDealingCards ? 'none' : 'all 0.3s ease-out 0s',
								}}
								className={`transition-all relative w-[clamp(45px,min(8.5vw,12.5vh),68px)] h-[clamp(67.5px,min(12.75vw,19vh),102px)] rounded-md sm:rounded-lg border-2 font-bold ${selectedCards.includes(card) ? "bg-yellow-400 border-yellow-500 shadow-xl" : "bg-white border-gray-400 shadow-md"} ${isMyTurn && !hasActed && (selectedCards.length < 3 || selectedCards.includes(card)) ? "hover:shadow-lg hover:-translate-y-2 cursor-pointer" : !isMyTurn || hasActed ? "cursor-not-allowed" : "bg-gray-400 cursor-not-allowed"}`}
							>
								{/* Top-left corner */}
								<div
									className={`absolute top-0.5 sm:top-1.5 left-0.5 sm:left-1 text-[10px] sm:text-sm leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
									<div className="leading-none">{rank}</div>
									<div style={{fontSize: 0.2 * cardHeight}}>{suit}</div>
								</div>

								{/* Center suit */}
								<div
									className={`absolute inset-0 flex items-center justify-center ${isRed ? 'text-red-600' : 'text-gray-900'}`}
									style={{fontSize: 0.3 * cardHeight}}>
									{suit}
								</div>

								{/* Bottom-right corner (upside down) */}
								<div
									className={`absolute bottom-0.5 sm:bottom-1 right-0.5 sm:right-1.5 text-[10px] sm:text-sm leading-none transform rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
									<div className="leading-none">{rank}</div>
									<div style={{fontSize: 0.2 * cardHeight}}>{suit}</div>
								</div>
							</button>);
						})}
					</div>
				</div>

				{/* Play Controls / Message Input with Morphing Effect */}
				<div className="relative flex flex-col sm:flex-row items-center justify-center" id="play-controls">

					{/* Communication and Play controls */}
					<div
						className="max-w-2xl mb-[4%] sm:mb-0 relative z-10 flex items-center gap-2 sm:gap-4 transition-all duration-500">

						{/* Message input */}
						{!allowedMessages ? (
							<div className="justify-center flex w-full sm:w-auto items-center gap-3 animate-fadeIn relative">
								<input
									type="text"
									placeholder="Send a message..."
									value={messageInput}
									onChange={(e) => setMessageInput(e.target.value)}
									onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
									className={`w-48 sm:w-56 md:w-80 px-1 py-1 rounded-xl backdrop-blur-lg bg-white bg-opacity-30 text-gray-950 text-center font-medium text-lg
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
							</div>) : (<div className="w-full sm:w-auto flex flex-col gap-1">
							<div className="flex gap-1 sm:gap-2 flex-wrap justify-center">
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

						{/* Play button */}
						<div className="sm:w-auto flex items-center gap-2 justify-center">
							{isMyTurn && !hasActed && !showRankInput && (
								<div
									className="flex-1 sm:flex-initial items-center gap-4 animate-fadeIn min-w-fit whitespace-nowrap relative">

									<button
										onClick={play}
										disabled={selectedCards.length === 0 || selectedCards.length > 3 || (isNewRound && !declaredRank)}
										className={`
																						px-4 py-2 rounded-xl font-bold text-white transition-all duration-300 transform
																						${selectedCards.length === 0 || (isNewRound && !declaredRank) ? 'bg-gray-600 cursor-not-allowed scale-95' : 'bg-green-600 hover:bg-green-500 hover:scale-105 active:scale-95 shadow-lg'}
																				`}
									>
										Play
									</button>
								</div>)}


							{/* Call Bluff button */}
							{isMyTurn && pileCards.length > 0 && state.current_rank && !hasActed && (
								<div className="pop-in flex-1 sm:flex-initial items-center gap-4">
									<button
										onClick={callBluff}
										className="bg-red-600 hover:bg-red-700 transition-all duration-300 transform hover:scale-105 active:scale-95 text-white font-bold py-2 px-4 rounded-xl"
									>
										Call!
									</button>
								</div>)}
						</div>
					</div>

					{/* Rank declaration button */}
					{isMyTurn && !hasActed && showRankInput && (
						<div
							className="max-w-2xl relative z-10 flex flex-row items-center gap-2 sm:gap-4 transition-all duration-500">
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
						</div>
					)
					}
				</div>
			</div>
		</div>
	</div>)
}
