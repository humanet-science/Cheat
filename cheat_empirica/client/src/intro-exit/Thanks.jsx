import React, {useState, useEffect} from "react";
import {usePlayer} from "@empirica/core/player/classic/react";
import {HumanetLogo} from "../../../../cheat_frontend/src/utils/Logo.jsx";

function generateBonusCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const middle = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `HU${middle}p`;
}

export function Thanks() {
  const player = usePlayer();
  const [localCode] = useState(generateBonusCode);

  useEffect(() => {
    if (player && !player.get("bonusCode")) {
      player.set("bonusCode", localCode);
    }
  }, [player]);

  const bonusCode = player?.get("bonusCode") ?? localCode;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" id="game-root">
      <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-lg space-y-5">
        <h1 className="text-2xl font-bold text-gray-500">
          Thank you for participating!
        </h1>
        <p className="text-gray-600">
          Your responses have been recorded. Submit the following code to Prolific to obtain your bonus:
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4">
          <span className="text-2xl font-mono font-bold text-blue-500 tracking-widest">
            {bonusCode}
          </span>
        </div>
        <p className="text-gray-600">
          If you enjoyed the game, you can continue playing for free at{" "}
          <a
            href="https://game.humanet.science"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 underline"
          >
            game.humanet.science
          </a>.
        </p>
        <HumanetLogo />
      </div>
    </div>
  );
}
