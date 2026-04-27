import React, { useState, useRef } from "react";

const getAPIBaseURL = () => {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "http://localhost:5050";
    }
    // In production both game. and study. proxy /api/* to the backend
    return `${window.location.protocol}//${hostname}`;
};

const labelClassName = "block text-sm font-medium text-gray-700 my-2";
const inputClassName = "appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm";

export default function ExitSurvey({ prolificId, gameId, onSubmit }) {
    const [myStrategy, setMyStrategy] = useState("");
    const [rightType, setRightType] = useState("");
    const [rightStrategy, setRightStrategy] = useState("");
    const [rightFeel, setRightFeel] = useState("");
    const [leftType, setLeftType] = useState("");
    const [leftStrategy, setLeftStrategy] = useState("");
    const [leftFeel, setLeftFeel] = useState("");
    const [overallExperience, setOverallExperience] = useState("");
    const [tutorialFeedback, setTutorialFeedback] = useState("");
    const [interfaceFeedback, setInterfaceFeedback] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState(null);


    const latestData = useRef({});
    latestData.current = {
        myStrategy,
        rightPlayer: { type: rightType, strategy: rightStrategy, feel: rightFeel },
        leftPlayer: { type: leftType, strategy: leftStrategy, feel: leftFeel },
        overallExperience,
        tutorialFeedback,
        interfaceFeedback,
    };

    async function handleSubmit(event) {
        event.preventDefault();
        if (submitted) return;
        setSubmitted(true);

        try {
            await fetch(`${getAPIBaseURL()}/api/survey`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prolific_id: prolificId,
                    game_id: gameId ?? null,
                    survey: { ...latestData.current },
                }),
            });
        } catch (e) {
            console.error("Failed to submit survey:", e);
            setError("There was a problem submitting your response. Your data may not have been saved.");
        }

        onSubmit();
    }

    const playerTypeOptions = ["Human", "AI agent", "Not sure"];

    const isComplete = [
        myStrategy, rightType, rightStrategy, rightFeel,
        leftType, leftStrategy, leftFeel,
        overallExperience, tutorialFeedback, interfaceFeedback,
    ].every((v) => v.trim() !== "");

    if (submitted && !error) {
        return (
            <div className="h-screen flex items-center justify-center">
                <p className="text-white text-lg">Submitting your responses...</p>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-y-auto py-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white p-8 rounded-2xl shadow-lg">
                <form className="space-y-8" onSubmit={handleSubmit}>
                    <div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Exit Survey</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            We are trying to improve the game and would be grateful for your feedback.
                            Please answer all questions. If a question does not apply, write 'N/A'.
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="space-y-6">
                        <div>
                            <label className={labelClassName}>What was your strategy in the game?</label>
                            <textarea className={inputClassName} dir="auto" rows={3} value={myStrategy} onChange={(e) => setMyStrategy(e.target.value)} />
                        </div>

                        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                            <h4 className="text-sm font-semibold text-gray-800">
                                For the player to your right (the one who played immediately before you):
                            </h4>
                            <div>
                                <label className={labelClassName}>Were they:</label>
                                <div className="flex gap-6">
                                    {playerTypeOptions.map((opt) => (
                                        <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={rightType === opt}
                                                onChange={() => setRightType(rightType === opt ? "" : opt)}
                                                className="rounded"
                                            />
                                            {opt}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={labelClassName}>What do you think their strategy was?</label>
                                <textarea className={inputClassName} dir="auto" rows={3} value={rightStrategy} onChange={(e) => setRightStrategy(e.target.value)} />
                            </div>
                            <div>
                                <label className={labelClassName}>How do you feel about them?</label>
                                <textarea className={inputClassName} dir="auto" rows={3} value={rightFeel} onChange={(e) => setRightFeel(e.target.value)} />
                            </div>
                        </div>

                        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                            <h4 className="text-sm font-semibold text-gray-800">
                                For the player to your left (the one who played immediately after you):
                            </h4>
                            <div>
                                <label className={labelClassName}>Were they:</label>
                                <div className="flex gap-6">
                                    {playerTypeOptions.map((opt) => (
                                        <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={leftType === opt}
                                                onChange={() => setLeftType(leftType === opt ? "" : opt)}
                                                className="rounded"
                                            />
                                            {opt}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={labelClassName}>What do you think their strategy was?</label>
                                <textarea className={inputClassName} dir="auto" rows={3} value={leftStrategy} onChange={(e) => setLeftStrategy(e.target.value)} />
                            </div>
                            <div>
                                <label className={labelClassName}>How do you feel about them?</label>
                                <textarea className={inputClassName} dir="auto" rows={3} value={leftFeel} onChange={(e) => setLeftFeel(e.target.value)} />
                            </div>
                        </div>

                        <div>
                            <label className={labelClassName}>Overall, what was your experience playing? How do you feel about the game?</label>
                            <textarea className={inputClassName} dir="auto" rows={3} value={overallExperience} onChange={(e) => setOverallExperience(e.target.value)} />
                        </div>

                        <div>
                            <label className={labelClassName}>Was there anything in the game rules that you found confusing? How can we improve the tutorial?</label>
                            <textarea className={inputClassName} dir="auto" rows={3} value={tutorialFeedback} onChange={(e) => setTutorialFeedback(e.target.value)} />
                        </div>

                        <div>
                            <label className={labelClassName}>Was there anything in the game play that was annoying? How can we improve the game interface?</label>
                            <textarea className={inputClassName} dir="auto" rows={3} value={interfaceFeedback} onChange={(e) => setInterfaceFeedback(e.target.value)} />
                        </div>
                    </div>

                    <div className="mb-12">
                        <button
                            type="submit"
                            disabled={!isComplete}
                            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                                text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
                        >
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
