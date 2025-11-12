import {PLAYER_GRADIENTS, CARD_RADIUS} from './constants';

/** Get pretty colours for each player
 *
 * @param playerId
 * @returns {string}
 */
export const getPlayerColor = (playerId) => {
	return PLAYER_GRADIENTS[playerId % PLAYER_GRADIENTS.length];
};


/** Calculate the positions of each player at the table, used e.g. for positioning message bubbles. This can be done
 * once at the start of the game.
 *
 * @param totalPlayers
 * @param radius
 * @returns {{}}
 */
export function getPlayerPositions(totalPlayers, radius = CARD_RADIUS) {

	const positions = {};

	for (let i = 0; i < totalPlayers; i++) {
		const angle = 90 + (360 / totalPlayers) * i;
		const angleRad = (angle * Math.PI) / 180;
		const x = Math.cos(angleRad) * radius;
		const y = Math.sin(angleRad) * radius;
		positions[i] = {x, y, angle};
	}

	return positions;
}

// Helper function to visualise cards
export const parseCard = (cardStr) => {
		// Extract rank and suit from string
		const rank = cardStr.slice(0, -1);
		const suit = cardStr.slice(-1);

		// Determine color based on suit
		const isRed = suit === '♥' || suit === '♦';

		return {rank, suit, isRed};
};