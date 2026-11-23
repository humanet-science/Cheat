import React, {useEffect} from "react";

/**
 *
 * @param discards
 * @returns {JSX.Element|null}
 * @constructor
 */
export default function DiscardAnimation({discards, width, height, playerPositions, selfId, tutorialScale = null}) {

	// Calculate available width AND height based on player positions.
	//
	// Width: constrained by the topmostPlayer (existing logic — keeps the box to
	// their right so it doesn't overlap them horizontally).
	//
	// Height: depends on which players actually fall inside the box's horizontal
	// footprint [boxLeftEdge, screenRight].
	//   • If the box extends left past a player's right edge, that player's top
	//     edge caps the height (the box would slide under them otherwise).
	//   • If the box sits entirely to the right of the topmostPlayer, the only
	//     height constraint comes from whatever player IS inside the box's range
	//     (e.g. the top-right player in a 4-player game).
	//   • If no player overlaps the box horizontally, fall back to half the screen.
	const calculateAvailableSpace = () => {
		// The discard box is `fixed` inside the game container.  When the
		// container has a CSS transform (tutorial mode), `position:fixed`
		// elements are positioned relative to that transformed ancestor, so
		// the coordinate system is the CONTAINER'S CSS space, not the viewport.
		//
		// player.x_css  = width/2  + pos.x          (game coords, CSS pixels)
		// player.y_css  = height/2 + pos.y
		// player half-sizes in CSS = rect.viewport_size / tutorialScale
		//
		// In normal mode (tutorialScale=null, ts=1) this reduces to the same
		// result as using viewport coords directly, since the container fills
		// the full viewport.
		if (!playerPositions) return { width: 0.8 * width, height: height * 0.4 };

		const ts = tutorialScale ?? 1;
		const boxRight_css = width - 16; // fixed right-4 in container CSS space

		// Convert every opponent to container CSS coordinates.
		const opponents = Object.entries(playerPositions)
			.filter(([id]) => parseInt(id) !== selfId)
			.map(([id, pos]) => {
				const el = document.getElementById(`player-${id}`);
				if (!el) return null;
				const r = el.getBoundingClientRect();
				const x_css = width  / 2 + pos.x;
				const y_css = height / 2 + pos.y;
				return {
					id,
					left_css:    x_css - r.width  / (2 * ts),
					right_css:   x_css + r.width  / (2 * ts),
					top_css:     y_css - r.height / (2 * ts),
					centerY_css: y_css,
				};
			})
			.filter(Boolean);

		// ── Width ────────────────────────────────────────────────────────────────
		// "Top players" = upper portion of the container (CSS y < 220).
		const topOpponents = opponents.filter(p => p.centerY_css < 220);

		let boxLeft_css = 16; // default: box spans nearly the full container
		if (topOpponents.length > 0) {
			const topmostPlayer = topOpponents.reduce((top, p) => {
				if (p.centerY_css < top.centerY_css) return p;
				if (p.centerY_css === top.centerY_css && p.right_css > top.right_css) return p;
				return top;
			});
			boxLeft_css = topmostPlayer.right_css + 20;
		}

		const availWidth_css = Math.max(0, boxRight_css - boxLeft_css);

		// ── Height ───────────────────────────────────────────────────────────────
		// Find the topmost opponent (smallest top_css) whose horizontal extent
		// overlaps the box.
		let minTop_css = null;
		for (const p of opponents) {
			if (p.right_css > boxLeft_css && p.left_css < boxRight_css) {
				if (minTop_css === null || p.top_css < minTop_css) minTop_css = p.top_css;
			}
		}

		const availHeight_css = minTop_css !== null
			? Math.max(0, minTop_css - 16 - 12)
			: height * 0.5;

		return { width: availWidth_css, height: availHeight_css };
	};

	const { width: availableWidth, height: availableHeight } = calculateAvailableSpace();

	// Determine card dimensions by iterating over possible row counts (1, 2, 3, …).
	// For each row count we compute a single scale factor s constrained by both the
	// available width (piles per row) and the available height (number of rows).
	// We pick the fewest rows where s * maxCardWidth >= minCardWidth.
	const calculateCardLayout = () => {
		const numSets = discards.length;
		const containerPadding = 32; // p-4 = 16px top + 16px bottom
		const headerHeight = 40;     // "Discarded Sets" label + mb-3
		const maxCardWidth = 50;
		const minCardWidth = 20;
		const maxOverlap = 12;
		const maxGap = 16;
		const minGap = 4;

		const availW = availableWidth - containerPadding;
		const availH = availableHeight - containerPadding - headerHeight;

		// A pile at scale 1 occupies (maxCardWidth + 3*maxOverlap) wide × maxCardWidth*1.5 tall.
		const maxPileWidth = maxCardWidth + 3 * maxOverlap;

		// For each row count, sWidth and sHeight pull in opposite directions:
		// more rows → larger sWidth (fewer piles per row) but smaller sHeight.
		// Iterate over all candidates and keep the one with the largest s.
		let bestS = 0;
		let bestLayout = null;

		for (let rows = 1; rows <= numSets; rows++) {
			const pilesPerRow = Math.ceil(numSets / rows);

			// Scale limited by width: fit `pilesPerRow` piles + gaps in availW
			const totalWAt1 = pilesPerRow * maxPileWidth + (pilesPerRow - 1) * maxGap;
			const sWidth = totalWAt1 > 0 ? availW / totalWAt1 : 1;

			// Scale limited by height: fit `rows` rows + gaps in availH
			const totalHAt1 = rows * maxCardWidth * 1.5 + (rows - 1) * maxGap;
			const sHeight = totalHAt1 > 0 ? availH / totalHAt1 : 1;

			const s = Math.min(1, sWidth, sHeight);
			const cardWidth = s * maxCardWidth;

			if (cardWidth >= minCardWidth && s > bestS) {
				bestS = s;
				const cardHeight = cardWidth * 1.5;
				const cardOverlap = s * maxOverlap;
				const setGap = Math.max(minGap, s * maxGap);
				bestLayout = {
					cardWidth,
					cardHeight,
					cardOverlap,
					setGap,
					fontSize: {
						corner: Math.max(8, cardWidth * 0.2),
						suit:   Math.max(8, cardWidth * 0.25),
						center: Math.max(12, cardWidth * 0.5),
					},
				};
			}
		}

		if (bestLayout) return bestLayout;

		// Absolute fallback: minimum dimensions
		return {
			cardWidth: minCardWidth,
			cardHeight: minCardWidth * 1.5,
			cardOverlap: minGap,
			setGap: minGap,
			fontSize: { corner: 8, suit: 8, center: 12 },
		};
	};

	const layout = calculateCardLayout();

	// Debug: draw available-space bounding box (now height-aware)
	// useEffect(() => {
	// 	document.querySelectorAll('.debug-discard-box').forEach(el => el.remove());
	// 	const debugBox = document.createElement('div');
	// 	debugBox.className = 'debug-discard-box';
	// 	debugBox.style.position = 'fixed';
	// 	debugBox.style.top = '16px';
	// 	debugBox.style.right = '16px';
	// 	debugBox.style.width = availableWidth + 'px';
	// 	debugBox.style.height = availableHeight + 'px';
	// 	debugBox.style.border = '3px solid lime';
	// 	debugBox.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
	// 	debugBox.style.pointerEvents = 'none';
	// 	debugBox.style.zIndex = '9999';
	// 	document.body.appendChild(debugBox);
	// 	return () => document.querySelectorAll('.debug-discard-box').forEach(el => el.remove());
	// }, [availableWidth, availableHeight]);

	if (discards.length === 0) return null;
	if (width < 500 || height < 500) return null;

	return (
    <div
      className="fixed top-4 right-4 rounded-lg p-4 z-0"
      style={{
        maxWidth: `${availableWidth}px`,
        maxHeight: `${availableHeight}px`,
        overflow: 'hidden', // hard stop — cards can never bleed past the calculated bounds
        ...(tutorialScale ? { transform: `scale(${1 / tutorialScale})`, transformOrigin: 'top right' } : {})
      }}
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
