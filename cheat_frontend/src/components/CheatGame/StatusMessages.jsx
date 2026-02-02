import React from "react";
import {createPortal} from 'react-dom';

/**
 * Display floating text bubbles above players
 *
 * Uses React Portal to render messages at #game-root level to avoid CSS transform issues
 * from parent containers (especially in the Tutorial which applies scale transforms).
 *
 * The component creates a fixed-position wrapper that can be scaled for the Tutorial context,
 * then positions individual messages absolutely within that wrapper. Position coordinates
 * are divided by tutorialScale to compensate for the wrapper's scaling transform.
 *
 * @param {Array} statusMessages - Array of message objects with structure:
 *   - id: unique identifier
 *   - position: {x, y} viewport coordinates
 *   - message: text to display
 *   - is_connection_timer: boolean for connection status messages
 *   - is_play_announcement: boolean for game action announcements
 * @param {number|null} tutorialScale - Scale factor for Tutorial context (e.g., 0.7).
 *   If null, no scaling is applied (normal gameplay).
 * @returns {ReactPortal} Messages rendered at #game-root level
 */
export default function StatusMessage({statusMessages, tutorialScale = null}) {
	const gameRoot = document.getElementById('game-root');

	if (!gameRoot) return null;

	return createPortal(<div style={{
		position: 'fixed',
		inset: 0,
		transform: tutorialScale ? `scale(${tutorialScale})` : 'none',
		transformOrigin: 'top left',
		pointerEvents: 'none',
		zIndex: 50
	}}>
		{statusMessages.map(msg => (<div
			key={msg.id}
			id={`status-${msg.id}`}
			className={`absolute pointer-events-none backdrop-blur-lg drop-shadow-lg
          ${msg.is_connection_timer ? 'text-sm rounded-3xl p-3 bg-opacity-20 bg-amber-50 -translate-x-1/2 -translate-y-full' : msg.is_play_announcement ? 'rounded-3xl p-3 bg-amber-200 bg-opacity-60 text-lg play-announcement' : 'text-sm rounded-3xl p-3 bg-opacity-20 bg-amber-50 message_float'}`}
			style={{
				left: tutorialScale ? `${msg.position.x / tutorialScale}px` : `${msg.position.x}px`,
				top: tutorialScale ? `${msg.position.y / tutorialScale}px` : `${msg.position.y}px`,
			}}
		>
			<div className="text-white font-semibold whitespace-nowrap">
				{msg.message}
			</div>
		</div>))}
	</div>, gameRoot);
}
