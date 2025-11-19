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
   className={`absolute pointer-events-none z-50 backdrop-blur-lg drop-shadow-lg 
       ${msg.is_connection_timer 
         ? 'text-sm rounded-3xl p-3 bg-opacity-20 bg-amber-50 -translate-x-1/2 -translate-y-full' 
         : msg.is_play_announcement 
           ? 'rounded-3xl p-3 bg-amber-200 bg-opacity-60 text-lg play-announcement' 
           : 'text-sm rounded-3xl p-3 bg-opacity-20 bg-amber-50 message_float'}`}
   style={{
    left: `${msg.position.x}px`, top: `${msg.position.y}px`,
   }}
  >
   <div className="text-white font-semibold whitespace-nowrap">
    {msg.message}
   </div>
  </div>)))
}