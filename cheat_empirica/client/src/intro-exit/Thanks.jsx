// client/src/Thanks.jsx
import React from "react";
import {HumanetLogo} from "../../../../cheat_frontend/src/utils/Logo.jsx";

export function Thanks() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" id="game-root">
      <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-lg">
        <h1 className="text-3xl font-bold text-gray-500 mb-4">
          Thank you for participating!
        </h1>
        <p className="text-lg text-gray-600">
          Your responses have been recorded. If you enjoyed the game, you continue playing for free at [URL].
        </p>
      </div>
			<div className="">
			<HumanetLogo/>
		</div>
    </div>
  );
}