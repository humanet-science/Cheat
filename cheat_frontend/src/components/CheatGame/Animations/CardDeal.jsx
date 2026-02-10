import {useEffect} from 'react';
import {CARD_DEAL_INTERVAL, CARD_FLIGHT_TIME} from "../../../utils/constants";

/**
 * Custom hook to manage card dealing animation
 * @param {Object} state - Game state
 * @param {number} selfId - Current player's ID
 * @param {boolean} dealingFromCenter - Whether dealing animation is active
 * @param {boolean} showDealAnimation - Whether to show animation or skip
 * @param {Function} setCenterDealCards - Set center deal cards state
 * @param {Function} setDealtCards - Set dealt cards count
 * @param {Function} setDealingFromCenter - Set dealing from center state
 * @param {Function} setShowLetsGo - Set show let's go state
 * @param {Function} setIsDealingCards - Set is dealing cards state
 * @param {Object} soundManager - Sound manager instance
 */
export function useCardDealAnimation({
																			 state,
																			 selfId,
																			 dealingFromCenter,
																			 showDealAnimation,
																			 setCenterDealCards,
																			 setDealtCards,
																			 setDealingFromCenter,
																			 setShowLetsGo,
																			 setIsDealingCards,
																			 soundManager,
																			 debug = false
																		 }) {

	// Debug mode: Loop the animation
	useEffect(() => {
		if (!debug || !state) return;

		const totalDuration = state.your_info.hand.length * state.players.length * 80 + 5000;

		const interval = setInterval(() => {
			// Reset and restart animation
			setDealingFromCenter(true);
			setIsDealingCards(true);
			setDealtCards(0);
			setShowLetsGo(false);
		}, totalDuration);

		// Start first loop
		setDealingFromCenter(true);
		setIsDealingCards(true);

		return () => clearInterval(interval);
	}, [debug, state, setDealingFromCenter, setIsDealingCards, setDealtCards, setShowLetsGo]);

	// Dealing animation - cards fly from center to players one at a time, round-robin
	useEffect(() => {
		if (!state || !dealingFromCenter) return;

		const cardsPerPlayer = state.your_info.hand.length;
		const players = state.players.map(p => p.your_info.id);

		// Create cards in dealing order: one to each player, then repeat
		const allCards = [];
		for (let round = 0; round < cardsPerPlayer; round++) {
			for (let playerIdx = 0; playerIdx < players.length; playerIdx++) {
				const cardDelay = allCards.length * CARD_DEAL_INTERVAL;
				allCards.push({
					id: Math.random(),
					targetPlayer: players[playerIdx],
					cardNumber: round, // Which card in their hand (0-9)
					delay: cardDelay, // Deal one every 80ms
					rotation: 180 * Math.random() // Generate rotation
				});
			}
		}

		setCenterDealCards(allCards);

		// Update dealtCards as cards arrive at player's position
		allCards.forEach((card, index) => {
			if (card.targetPlayer === selfId) {
				setTimeout(() => {
					setDealtCards(prev => prev + 1);
					soundManager.play('cardPlay', 0.2); // Play sound when card arrives
				}, card.delay + CARD_FLIGHT_TIME); // Delay + flight time
			}
		});

		// Finish dealing animation
		const totalDuration = allCards.length * 80 + 1000;
		const lastCardsStart = (allCards.length - 2) * 80; // When last 2 cards start dealing

		// Show "Let's Go!" during last 5 cards
		setTimeout(() => {
			setShowLetsGo(true);
			soundManager.play('start_bell');
		}, lastCardsStart);

		// Finish dealing
		setTimeout(() => {
			setDealingFromCenter(false);
			setCenterDealCards([]);
		}, totalDuration);

		// Hide "Let's Go!" and start game
		setTimeout(() => {
			setShowLetsGo(false);
			setIsDealingCards(false);
		}, lastCardsStart + 2500); // Extra 2.5s for text to fade

	}, [state?.players, selfId, dealingFromCenter, setCenterDealCards, setDealtCards, setDealingFromCenter, setShowLetsGo, setIsDealingCards, soundManager]);

	// If skipping animation, set dealing to false immediately when state loads
	useEffect(() => {
		if (!showDealAnimation && state) {
			setDealingFromCenter(false);
			setIsDealingCards(false);
			setDealtCards(state.your_info.hand.length); // Set to full hand length
		}
	}, [showDealAnimation, state, setDealingFromCenter, setIsDealingCards, setDealtCards]);
}

export function CardDeal({dealingCards = [], playerPositions = {}, tableCenter}) {

	return (

		<div className="fixed -z-1"
				 style={{
					 left: `calc(50% + ${tableCenter.x}px)`,
					 top: `calc(50% + ${tableCenter.y}px)`,
					 transform: "translate(-50%, -50%)"
				 }}>

			{/* Dealing animation - cards appear and fly to players */}
			{dealingCards.map((card) => {
				const target = playerPositions[card.targetPlayer];
				if (!target) return null;
				// Adjust target relative to ellipse center

				// Random offset from center to simulate hand movement
				const startOffsetX = Math.random() * 40 - 20; // -20 to 20px
				const startOffsetY = Math.random() * 40 - 20;
				return (
					<div
						key={card.id}
						className="absolute w-[clamp(30px,min(5.66vw,8.3vh),45.3px)] h-[clamp(45px,min(8.5vw,12.6vh),68px)] rounded bg-blue-600 border-2 border-white pointer-events-none"
						style={{
							left: `${target.x}px`,
							top: `${target.y}px`,
							transform: `rotate(${card.rotation}deg)`,
							opacity: 0,
							animation: `dealCardFlick ${CARD_FLIGHT_TIME / 1000}s ease-out forwards`,
							animationDelay: `${card.delay}ms`,
							'--start-offset-x': `${startOffsetX}px`,
							'--start-offset-y': `${startOffsetY}px`,
							'--target-x': `${target.x}px`,
							'--target-y': `${target.y}px`,
							'--target-rotation': `${card.rotation}deg`
						}}
					/>
				);
			})}
		</div>
	);
}
