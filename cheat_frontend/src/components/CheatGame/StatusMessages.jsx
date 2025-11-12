import React from "react";

/** Display a text bubble above a user
 *
 * @param statusMessages
 * @returns {*}
 * @constructor
 */
export default function StatusMessage({statusMessages}) {
	return (statusMessages.map(msg => (<div
		key={msg.id}
		id={`status-${msg.id}`}
		className="absolute pointer-events-none z-50 backdrop-blur bg-amber-50 bg-opacity-20 rounded-3xl p-3 drop-shadow-lg"
		style={{
			left: `${msg.position.x}px`, top: `${msg.position.y}px`,
		}}
	>
		<div className="text-white text-lg font-semibold whitespace-nowrap">
			{msg.message}
		</div>
	</div>)))
}