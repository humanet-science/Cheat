import React, { useState, useRef } from "react";

const getAPIBaseURL = () => {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "http://localhost:5050";
    }
    return `${window.location.protocol}//${hostname}`;
};

const labelClassName = "block text-sm font-medium text-gray-700 mb-3";

function LikertSlider({ leftLabel, rightLabel, value, onChange }) {
    const touched = !Number.isNaN(value);
    return (
        <div className="flex items-center gap-4 py-1">
            <span className="text-sm text-gray-500 w-36 text-right shrink-0">{leftLabel}</span>
            <div className="flex-1">
                <div className="relative flex items-center">
                    <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full pointer-events-none" />
                    {[0, 25, 50, 75, 100].map((pct) => (
                        <div
                            key={pct}
                            className="absolute w-1.5 h-1.5 bg-gray-400 rounded-full pointer-events-none"
                            style={{ left: `calc(${pct / 100} * (100% - 16px) + 8px)`, transform: 'translateX(-50%)' }}
                        />
                    ))}
                    <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={touched ? value : 3}
                        onChange={(e) => onChange(Number(e.target.value))}
                        onPointerDown={touched ? undefined : (e) => {
                            // If the click lands on the default value (3), onChange never fires,
                            // so force-compute the value from pointer position.
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pad = 10; // half of 20px thumb
                            const usable = Math.max(1, rect.width - pad * 2);
                            const x = Math.max(0, Math.min(e.clientX - rect.left - pad, usable));
                            onChange(Math.max(1, Math.min(5, Math.round(1 + (x / usable) * 4))));
                        }}
                        className={`relative w-full cursor-pointer${touched ? '' : ' slider-untouched'}`}
                        style={{ background: 'transparent' }}
                    />
                </div>
            </div>
            <span className="text-sm text-gray-500 w-36 shrink-0">{rightLabel}</span>
        </div>
    );
}

function RadioGroup({ options, value, onChange, name }) {
    return (
        <div className="flex gap-6">
            {options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                        type="radio"
                        name={name}
                        checked={value === opt}
                        onChange={() => onChange(opt)}
                        className="accent-blue-500"
                    />
                    {opt}
                </label>
            ))}
        </div>
    );
}

const PLAYER_TYPE_OPTIONS = ["Human", "AI agent", "Not sure"];

const initSliders = () => ({ lied: NaN, called: NaN, annoying: NaN, mean: NaN, cautious: NaN, clueless: NaN, deceitful: NaN, cynical: NaN });

function PlayerSection({ side, description, type, onTypeChange, sliders, onSliderChange }) {
    const strategySliders = side === "right"
        ? [
            { key: "lied",   left: "Lied too often",    right: "Almost never lied" },
            { key: "called", left: "Called too often",   right: "Almost never called" },
        ]
        : [
            { key: "called", left: "Called too often",   right: "Almost never called" },
            { key: "lied",   left: "Lied too often",    right: "Almost never lied" },
        ];

    const personalitySliders = [
        { key: "clueless",  left: "Clueless",    right: "Clever" },
        { key: "deceitful", left: "Deceitful",   right: "Honest" },
        { key: "cynical",   left: "Suspicious",     right: "Trusting" },
        { key: "cautious",  left: "Cautious",    right: "Risk-taking" },
    ];

    return (
        <div className="border border-gray-200 rounded-lg p-5 space-y-5">
            <div>
                <h4 className="text-sm font-semibold text-gray-800">{description}</h4>
            </div>

            <div>
                <label className={labelClassName}>Were they:</label>
                <RadioGroup options={PLAYER_TYPE_OPTIONS} value={type} onChange={onTypeChange} name={`player-type-${side}`} />
            </div>

            <div>
                <label className={labelClassName}>What did you think of their strategy? <span className="font-normal text-gray-400">(Click on the scale to select your answer.)</span></label>
                <div className="space-y-2">
                    {strategySliders.map(({ key, left, right }) => (
                        <LikertSlider
                            key={key}
                            leftLabel={left}
                            rightLabel={right}
                            value={sliders[key]}
                            onChange={(v) => onSliderChange(key, v)}
                        />
                    ))}
                </div>
            </div>

            <div>
                <label className={labelClassName}>How would you describe them as a player?</label>
                <div className="space-y-2">
                    {personalitySliders.map(({ key, left, right }) => (
                        <LikertSlider
                            key={key}
                            leftLabel={left}
                            rightLabel={right}
                            value={sliders[key]}
                            onChange={(v) => onSliderChange(key, v)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function ExitSurvey({ prolificId, gameId, onSubmit }) {
    const [myStrategy, setMyStrategy] = useState("");
    const [rightType, setRightType] = useState("");
    const [rightSliders, setRightSliders] = useState(initSliders());
    const [leftType, setLeftType] = useState("");
    const [leftSliders, setLeftSliders] = useState(initSliders());
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState(null);

    const latestData = useRef({});
    latestData.current = {
        myStrategy,
        rightPlayer: { type: rightType, sliders: rightSliders },
        leftPlayer:  { type: leftType,  sliders: leftSliders  },
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


    if (submitted && !error) {
        return (
            <div className="h-screen flex items-center justify-center">
                <p className="text-white text-lg">Submitting your responses...</p>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-y-auto py-8 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white p-8 rounded-2xl shadow-lg">
                <form className="space-y-8" onSubmit={handleSubmit}>
                    <div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Exit Survey</h3>
                        <p className="mt-1 text-sm text-gray-500">Please answer the short survey below.</p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="space-y-6">
                        <div>
                            <label className={labelClassName}>What was your overall strategy in the game?</label>
                            <textarea
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                dir="auto"
                                rows={3}
                                value={myStrategy}
                                onChange={(e) => setMyStrategy(e.target.value)}
                            />
                        </div>

                        <PlayerSection
                            side="right"
                            description="Think of the player to your right. This is the player who played immediately before you, and whom you could either call out or continue their play."
                            type={rightType}
                            onTypeChange={setRightType}
                            sliders={rightSliders}
                            onSliderChange={(key, val) => setRightSliders((prev) => ({ ...prev, [key]: val }))}
                        />

                        <PlayerSection
                            side="left"
                            description="Think of the player to your left. This is the player who played immediately after you, and who could either call you out or continue your play."
                            type={leftType}
                            onTypeChange={setLeftType}
                            sliders={leftSliders}
                            onSliderChange={(key, val) => setLeftSliders((prev) => ({ ...prev, [key]: val }))}
                        />
                    </div>

                    <div className="mb-12">
                        <button
                            type="submit"
                                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
                        >
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
