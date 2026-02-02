import React from "react";
import {HumanetLogo} from "../../../../cheat_frontend/src/utils/Logo.jsx";

export function noGames() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" id="game-root">
      <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-lg">
        <h1 className="text-2xl font-bold text-gray-500 mb-4">
          🚧️ No experiments
        </h1>
        <p className="text-lg text-gray-600">
          There are currently no available experiments.
					Please wait until an experiment becomes available or come back at a later date.
        </p>
      </div>
			<div className="">
			<HumanetLogo/>
		</div>
    </div>
  );
}
