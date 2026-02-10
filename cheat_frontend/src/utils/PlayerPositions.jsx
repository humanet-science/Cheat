import {useState, useEffect, useRef} from 'react';

/**
 * Custom hook to manage player positions around an ellipse
 * @param {number} numPlayers - Total number of players
 * @param {number} selfId - ID of the player
 * @param {number} width - Window width
 * @param {number} height - Window height
 * @returns {Object} { playerPositions, playerPositionsRef, tableCenter }
 */
export function usePlayerPositions(numPlayers, selfId, width, height, isMyTurn, hasActed, hand) {
	const [playerPositions, setPlayerPositions] = useState({});
	const playerPositionsRef = useRef({});

	useEffect(() => {

		const measureAndPosition = () => {

			// Measure your hand using DOM id
			let handHeight = 150;
			const yourHandElement = document.getElementById(`player-${selfId}`);
			if (yourHandElement) {
				const handRect = yourHandElement.getBoundingClientRect();
				handHeight = handRect.height;
			}

			// Measure all opponents and find maximum dimensions
			let opponentWidth = 0;
			let opponentHeight = 0;
			for (let i = 0; i < numPlayers; i++) {
				if (i !== selfId) {
					const opponentElement = document.getElementById(`player-${i}`);
					if (opponentElement) {
						const oppRect = opponentElement.getBoundingClientRect();
						opponentWidth = Math.max(opponentWidth, oppRect.width);
						opponentHeight = Math.max(opponentHeight, oppRect.height);
					}
				}
			}

			// Use fallback only if no opponents were measured
			if (opponentWidth === 0) {
				opponentWidth = 50;
				opponentHeight = 50;
			}

			// Calculate positions. Screen size is given a 10% margin, and the ellipse is restricted to 400px for large
			// screens. Also restrict the eccentricity of the ellipse to at most 1.5
			let radiusX = Math.min(0.5 * width * 0.95 - opponentWidth / 2 - 20, 400);
			let radiusY = Math.min(0.5 * height * 0.95 - opponentHeight / 2 - 20, 400); // need to account for curved player name
			radiusY = Math.min(radiusY, 2.0 * radiusX);
			let positions = getPlayerPositions(numPlayers, selfId, radiusX, radiusY);

			// Move the player hand up
			positions[selfId].y -= handHeight / 2 - opponentHeight / 2 - 20;

			// Adjust to avoid player icons overlapping with cards/play controls
			// Get bounding boxes for player cards and play controls
			const selfCards = document.getElementById('self-cards');
			const playControls = document.getElementById('play-controls');

			const selfCardsRect = selfCards?.getBoundingClientRect();
			const playControlsRect = playControls?.getBoundingClientRect();

			const padding = 40;
			const margin_x = width * 0.05; // 5% margin on each side
			const margin_y = height * 0.05;
			for (let i = 0; i < numPlayers; i++) {
				if (i !== selfId) {

					let x = positions[i].x;
					let y = positions[i].y;

					// Check intersection with selfCards and playControls
					const checkIntersection = (rect) => {
						if (!rect) return false;
						const oppLeft = x - opponentWidth / 2 - padding;
						const oppRight = x + opponentWidth / 2 + padding;
						const oppBottom = y + opponentHeight / 2 + padding;

						// Convert rectangle to viewport
						const relLeft = rect.left - width / 2;
						const relRight = rect.right - width / 2;
						const relTop = rect.top - height / 2;

						// Check if rectangles overlap
						// y-axis goes from top to bottom
						return (
							((oppRight > relLeft && oppRight < relRight) || (oppLeft > relLeft && oppLeft < relRight)) && (oppBottom > relTop)
						);
					};
					if (checkIntersection(selfCardsRect) || checkIntersection(playControlsRect)) {

						// Combine both rects to find the obstacle area
						const obstacles = [selfCardsRect, playControlsRect].filter(r => r);
						const obstacleLeft = Math.min(...obstacles.map(r => r.left - width / 2));
						const obstacleRight = Math.max(...obstacles.map(r => r.right - width/2));
						const obstacleTop = Math.min(...obstacles.map(r => r.top - height / 2));
						const obstacleBottom = Math.max(...obstacles.map(r => r.bottom - height / 2));

						// Calculate distances to move in each direction
						const moveUp = obstacleTop - (y + opponentHeight / 2 + padding);
						const moveDown = obstacleBottom - (y - opponentHeight / 2 - padding);
						const moveLeft = obstacleLeft - (x + opponentWidth / 2 + padding);
						const moveRight = obstacleRight - (x - opponentWidth / 2 - padding);

						// Check which moves keep opponent in bounds
						const moves = [];
						if (y + moveUp - opponentHeight / 2 >= -height / 2 + margin_y) moves.push({
							dir: 'up',
							dist: Math.abs(moveUp),
							apply: () => y += moveUp
						});
						if (y + moveDown + opponentHeight / 2 <= height / 2 - margin_y) moves.push({
							dir: 'down',
							dist: Math.abs(moveDown),
							apply: () => y += moveDown
						});
						if (x + moveLeft - opponentWidth / 2 >= -width / 2 + margin_x) moves.push({
							dir: 'left',
							dist: Math.abs(moveLeft),
							apply: () => x += moveLeft
						});
						if (x + moveRight + opponentWidth / 2 <= width / 2 - margin_x) moves.push({
							dir: 'right',
							dist: Math.abs(moveRight),
							apply: () => x += moveRight
						});

						// Pick the smallest valid move
						if (moves.length > 0) {
							moves.sort((a, b) => a.dist - b.dist);
							moves[0].apply();
						}

						positions[i].x = x;
						positions[i].y = y;
					}
				}
			}

			playerPositionsRef.current = positions;
			setPlayerPositions(positions);
		};

		measureAndPosition()

		// Initial measurement with delay to let DOM render
		const timeoutId = setTimeout(measureAndPosition, 100);

		// Re-measure on window resize
		window.addEventListener('resize', measureAndPosition);

		return () => {
			clearTimeout(timeoutId);
			window.removeEventListener('resize', measureAndPosition);
		};
	}, [width, height, isMyTurn, hasActed, hand]);

	// Calculate the center of the ellipse from player positions
	const calculateTableCenter = () => {
		const positions = Object.values(playerPositions);
		if (positions.length === 0) return {x: 0, y: 0};

		// Measure hand height for offset calculation
		let handHeight = 0;
		const yourHandElement = document.getElementById(`player-${selfId}`);
		if (yourHandElement) {
			const handRect = yourHandElement.getBoundingClientRect();
			handHeight = handRect.height;
		}

		// Average all player positions to find the center
		const sumX = positions.reduce((sum, pos) => sum + pos.x, 0);
		const sumY = positions.reduce((sum, pos) => sum + pos.y, 0);

		return {
			x: sumX / positions.length, y: sumY / positions.length - handHeight / 4
		};
	};

	const tableCenter = calculateTableCenter();

	return {
		playerPositions, playerPositionsRef, tableCenter
	};
}

/**
 * Calculate positions for all players around an ellipse
 * @param {number} numPlayers - Total number of players
 * @param {number} selfId - ID of the current player
 * @param {number} radiusX - Horizontal radius of the ellipse
 * @param {number} radiusY - Vertical radius of the ellipse
 * @param {number} offsetY - Vertical offset of the ellipse center
 * @returns {Object} Object mapping player IDs to {x, y} positions
 */
function getPlayerPositions(numPlayers, selfId, radiusX, radiusY, offsetY = 0) {
	const positions = {};
	const angleStep = (2 * Math.PI) / numPlayers;

	for (let i = 0; i < numPlayers; i++) {
		const playerId = (selfId + i) % numPlayers;

		// Start at bottom (Math.PI/2) for the player (i=0)
		const angle = Math.PI / 2 + i * angleStep;

		let x = radiusX * Math.cos(angle);
		let y = radiusY * Math.sin(angle) + offsetY;

		positions[playerId] = {x, y};
	}

	return positions;
}
