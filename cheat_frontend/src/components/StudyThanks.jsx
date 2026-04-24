import React from "react";
import { HumanetLogo } from "../utils/Logo";

export default function StudyThanks({ timedOut = false }) {
    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-lg space-y-5">
                <h1 className="text-2xl font-bold text-gray-500">
                    {timedOut
                      ? "Thank you for showing up!"
                      : "Thank you for participating!"
                    }
                </h1>
                <p className="text-gray-600">
                    {timedOut
                        ? "We are sorry — we couldn't find enough players for a game today. Click below to complete the study on Prolific:"
                        : "Your responses have been recorded. Click below to complete the study on Prolific:"}
                </p>
                <a
                    href="https://app.prolific.com/submissions/complete?cc=CACBLBNZ"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
                >
                    Complete on Prolific
                </a>
                <p className="text-gray-600">
                    If you are curious about the game, you can continue playing for free at{" "}
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
