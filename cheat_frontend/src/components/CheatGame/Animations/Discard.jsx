import React, {useEffect} from "react";

/**
 *
 * @param discards
 * @returns {JSX.Element|null}
 * @constructor
 */
export default function DiscardAnimation({discards, width, height, playerPositions, selfId}) {


	// Calculate available width based on player positions
	const calculateAvailableWidth = () => {
		if (!playerPositions) return 0.8 * width;

		// Find players in the top portion of screen
		const topPlayers = Object.entries(playerPositions)
			.filter(([id]) => parseInt(id) !== selfId)
			.map(([id, pos]) => {
				const viewportY = height / 2 + pos.y;
    const viewportX = width / 2 + pos.x;
    return { id, x: viewportX, y: viewportY };
			})
			.filter(player => player.y < 220); // Top 30% of screen

		if (topPlayers.length === 0) {
			// No players near top, use full width
			return 0.9 * width;
		}

		// Find the topmost player (or rightmost if multiple at same height)
		const topmostPlayer = topPlayers.reduce((top, player) => {
			if (player.y < top.y) return player;
			if (player.y === top.y && player.x > top.x) return player;
			return top;
		});

		// Get actual element to measure width
		const element = document.getElementById(`player-${topmostPlayer.id}`);
		if (!element) return width;

		const rect = element.getBoundingClientRect();
		const playerRightEdge = rect.right + 20;

		// If player is too close to top (within 200px), constrain width
		if (topmostPlayer.y < 220) {
			return width - playerRightEdge - 20; // 20px padding
		}

		return width;
	};

	const availableWidth = calculateAvailableWidth();

	// Calculate adaptive card sizing based on available width
  const calculateCardLayout = () => {
    const numSets = discards.length;
    const basePadding = 28; // Container padding
    const minCardWidth = 30;
    const maxCardWidth = 50;
    const minOverlap = 8;
    const maxOverlap = 12;
    const minGap = 8;
    const maxGap = 16;

    // Each set needs: cardWidth + (3 * overlap) for the 4 overlapping cards
    const availableForCards = availableWidth - basePadding;

    // Calculate what card width we can afford
    let cardWidth = maxCardWidth;
    let cardOverlap = maxOverlap;
    let setGap = maxGap;

    // Try with max dimensions first
    let totalWidth = numSets * (cardWidth + 3 * cardOverlap) + (numSets - 1) * setGap;

    if (totalWidth > availableForCards) {
      // Need to scale down
      const scaleFactor = availableForCards / totalWidth;
      cardWidth = Math.max(minCardWidth, cardWidth * scaleFactor);
      cardOverlap = Math.max(minOverlap, cardOverlap * scaleFactor);
      setGap = Math.max(minGap, setGap * scaleFactor);
    }

    const cardHeight = cardWidth * 1.5; // Maintain aspect ratio
    const fontSize = {
      corner: Math.max(8, cardWidth * 0.2),
      suit: Math.max(8, cardWidth * 0.25),
      center: Math.max(12, cardWidth * 0.5)
    };

    return { cardWidth, cardHeight, cardOverlap, setGap, fontSize };
  };

  const layout = calculateCardLayout();


	// Debug: Draw available space box
	// useEffect(() => {
	// 	// Remove existing debug box
	// 	document.querySelectorAll('.debug-discard-box').forEach(el => el.remove());
	//
	// 	const debugBox = document.createElement('div');
	// 	debugBox.className = 'debug-discard-box';
	// 	debugBox.style.position = 'fixed';
	// 	debugBox.style.top = '16px'; // top-4
	// 	debugBox.style.right = '16px'; // right-4
	// 	debugBox.style.width = availableWidth + 'px';
	// 	debugBox.style.height = '140px'; // Approximate height
	// 	debugBox.style.border = '3px solid lime';
	// 	debugBox.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
	// 	debugBox.style.pointerEvents = 'none';
	// 	debugBox.style.zIndex = '9999';
	// 	document.body.appendChild(debugBox);
	//
	// 	return () => {
	// 		document.querySelectorAll('.debug-discard-box').forEach(el => el.remove());
	// 	};
	// }, [availableWidth, width, height, playerPositions]);

		if (discards.length === 0) return null;
		if (width < 500 || height < 500) return null;


	return (
    <div
      className="fixed top-4 right-4 rounded-lg p-4 z-0"
      style={{ maxWidth: `${availableWidth}px` }}
    >
      <div
        className="font-bold mb-3 opacity-75 flex justify-end"
        style={{ fontSize: `${layout.fontSize.corner * 1.2}px` }}
      >
        Discarded Sets
      </div>
      <div className="flex flex-wrap justify-end" style={{ gap: `${layout.setGap}px` }}>
        {discards.map((rank, setIndex) => (
          <div
            key={setIndex}
            className="relative"
            style={{
              animation: 'popIn_cards 0.5s ease-out'
            }}
          >
            {/* Show 4 overlapping cards for each set */}
            <div
              className="relative"
              style={{
                width: `${layout.cardWidth + 3 * layout.cardOverlap}px`,
                height: `${layout.cardHeight}px`
              }}
            >
              {['♠', '♥', '♣', '♦'].map((suit, cardIndex) => {
                const isRed = suit === '♥' || suit === '♦';
                return (
                  <div
                    key={cardIndex}
                    className="absolute bg-gray-200 drop-shadow-xl rounded border border-gray-300 shadow-md"
                    style={{
                      width: `${layout.cardWidth}px`,
                      height: `${layout.cardHeight}px`,
                      left: `${cardIndex * layout.cardOverlap}px`,
                      top: 0,
                      zIndex: cardIndex,
                      animation: `cardPop 0.3s ease-out ${cardIndex * 0.1}s both`
                    }}
                  >
                    {/* Top-left corner */}
                    <div
                      className={`absolute leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}
                      style={{
                        top: '2px',
                        left: '4px',
                        fontSize: `${layout.fontSize.corner}px`
                      }}
                    >
                      <div className="font-bold leading-none">{rank}</div>
                      <div className="leading-none" style={{ fontSize: `${layout.fontSize.suit}px` }}>{suit}</div>
                    </div>

                    {/* Center suit */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${isRed ? 'text-red-600' : 'text-gray-900'}`}
                      style={{ fontSize: `${layout.fontSize.center}px` }}
                    >
                      {suit}
                    </div>

                    {/* Bottom-right corner */}
                    <div
                      className={`absolute transform rotate-180 leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}
                      style={{
                        bottom: '2px',
                        right: '4px',
                        fontSize: `${layout.fontSize.corner}px`
                      }}
                    >
                      <div className="font-bold leading-none">{rank}</div>
                      <div className="leading-none" style={{ fontSize: `${layout.fontSize.suit}px` }}>{suit}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
