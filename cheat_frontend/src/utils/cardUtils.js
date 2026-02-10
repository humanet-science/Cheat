import {PLAYER_GRADIENTS} from './constants';

/** Get pretty colours for each player
 *
 * @param playerId
 * @returns {string}
 */
export const getPlayerColor = (playerId) => {
    return PLAYER_GRADIENTS[playerId % PLAYER_GRADIENTS.length];
};


// Helper function to visualise cards
export const parseCard = (cardStr) => {
    // Extract rank and suit from string
    const rank = cardStr.slice(0, -1);
    const suit = cardStr.slice(-1);

    // Determine color based on suit
    const isRed = suit === '♥' || suit === '♦';

    return {rank, suit, isRed};
};
