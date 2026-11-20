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

function RadioGroup({ options, value, onChange, name, vertical = false }) {
    return (
        <div className={vertical ? "flex flex-col gap-2" : "flex flex-wrap gap-6"}>
            {options.map(({ value: optValue, label }) => (
                <label key={optValue} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                        type="radio"
                        name={name}
                        checked={value === optValue}
                        onChange={() => onChange(optValue)}
                        className="accent-blue-500"
                    />
                    {label}
                </label>
            ))}
        </div>
    );
}

function NumberScale({ min, max, leftLabel, rightLabel, value, onChange, name }) {
    const points = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
        <div className="flex items-center gap-4 py-1">
            <span className="text-sm text-gray-500 w-28 text-right shrink-0">{leftLabel}</span>
            <div className="flex-1 flex justify-between">
                {points.map((n) => (
                    <label key={n} className="flex flex-col items-center gap-1 text-sm text-gray-700 cursor-pointer">
                        <input
                            type="radio"
                            name={name}
                            checked={value === n}
                            onChange={() => onChange(n)}
                            className="accent-blue-500 w-4 h-4"
                        />
                        {n}
                    </label>
                ))}
            </div>
            <span className="text-sm text-gray-500 w-28 shrink-0">{rightLabel}</span>
        </div>
    );
}

const SLIDER_HINT = <span className="font-normal text-gray-400">(Click on the scale to select your answer.)</span>;

const COMPOSITION_OPTIONS = [
    { value: "3_humans",        label: "Three other humans" },
    { value: "2_humans_1_ai",   label: "Two other humans and one AI agent" },
    { value: "1_human_2_ai",    label: "One other human and two AI agents" },
    { value: "3_ai",            label: "Three AI agents" },
];

const OTHER_PLAYER_OPTIONS = [
    { value: "left",   label: "Player to your left" },
    { value: "right",  label: "Player to your right" },
    { value: "across", label: "Player across from you" },
    { value: "nobody", label: "Nobody" },
];

const RANK_PLAYER_OPTIONS = [
    { value: "you",    label: "You" },
    { value: "left",   label: "Player to your left" },
    { value: "right",  label: "Player to your right" },
    { value: "across", label: "Player across from you" },
];

// Keys are the attitude components (not shown to participants).
const AI_ATTITUDE_STATEMENTS = [
    { key: "behavioural", text: "I want to use AI in my daily life." },
    { key: "affective",   text: "I am afraid of AI." },
    { key: "cognitive",   text: "AI has many advantages." },
];

const RANK_PLACES = [
    { key: "first",  label: "First place" },
    { key: "second", label: "Second place" },
    { key: "third",  label: "Third place" },
    { key: "last",   label: "Last place" },
];

function Question({ label, children }) {
    return (
        <div className="border border-gray-200 rounded-lg p-5">
            <label className={labelClassName}>{label}</label>
            {children}
        </div>
    );
}

function RankingQuestion({ ranking, onChange }) {
    return (
        <div className="space-y-3">
            {RANK_PLACES.map(({ key, label }) => {
                const takenElsewhere = new Set(
                    Object.entries(ranking).filter(([k, v]) => k !== key && v).map(([, v]) => v)
                );
                return (
                    <div key={key} className="flex items-center gap-4">
                        <span className="text-sm text-gray-700 w-28 shrink-0">{label}</span>
                        <select
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            value={ranking[key]}
                            onChange={(e) => onChange({ ...ranking, [key]: e.target.value })}
                        >
                            <option value="">Select a player…</option>
                            {RANK_PLAYER_OPTIONS.map(({ value, label: optLabel }) => (
                                <option key={value} value={value} disabled={takenElsewhere.has(value)}>
                                    {optLabel}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            })}
        </div>
    );
}

export default function ExitSurvey({ prolificId, gameId, onSubmit }) {
    const [otherPlayers, setOtherPlayers] = useState("");
    const [preferredPlayers, setPreferredPlayers] = useState("");
    const [enjoyment, setEnjoyment] = useState(NaN);
    const [winnerDeserved, setWinnerDeserved] = useState(NaN);
    const [winnerHappy, setWinnerHappy] = useState(NaN);
    const [replacePlayer, setReplacePlayer] = useState("");
    const [teamPlayer, setTeamPlayer] = useState("");
    const [ownPerformance, setOwnPerformance] = useState(NaN);
    const [fairChance, setFairChance] = useState(NaN);
    const [ranking, setRanking] = useState({ first: "", second: "", third: "", last: "" });
    const [aiAttitudes, setAiAttitudes] = useState({ behavioural: NaN, affective: NaN, cognitive: NaN });
    const [comments, setComments] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState(null);

    // Sliders are stored as 1–5 (1 = left label, 5 = right label); NaN = unanswered → null.
    const sliderValue = (v) => (Number.isNaN(v) ? null : v);

    const latestData = useRef({});
    latestData.current = {
        otherPlayers,
        preferredPlayers,
        enjoyment: sliderValue(enjoyment),
        winnerDeserved: sliderValue(winnerDeserved),
        winnerHappy: sliderValue(winnerHappy),
        replacePlayer,
        teamPlayer,
        ownPerformance: sliderValue(ownPerformance),
        fairChance: sliderValue(fairChance),
        ranking,
        aiAttitudes: Object.fromEntries(Object.entries(aiAttitudes).map(([k, v]) => [k, sliderValue(v)])),
        comments: comments.trim(),
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
                        <Question label="Who were the other players in the game?">
                            <RadioGroup vertical options={COMPOSITION_OPTIONS} value={otherPlayers} onChange={setOtherPlayers} name="other-players" />
                        </Question>

                        <Question label="Rate your overall enjoyment playing the game.">
                            <NumberScale min={1} max={5} leftLabel="Not at all" rightLabel="Very much" value={enjoyment} onChange={setEnjoyment} name="enjoyment" />
                        </Question>

                        <Question label={<>Do you think you had a fair chance of winning?</>}>
                            <NumberScale min={1} max={5} leftLabel="Not at all" rightLabel="Very much" value={fairChance} onChange={setFairChance} name="fair-chance" />
                        </Question>

                        <Question label="If you were to play again, who would you prefer to play with?">
                            <RadioGroup vertical options={COMPOSITION_OPTIONS} value={preferredPlayers} onChange={setPreferredPlayers} name="preferred-players" />
                        </Question>

                        {/*<Question label={<>Think about the person who won the last round. {SLIDER_HINT}</>}>*/}
                        {/*    <div className="space-y-4">*/}
                        {/*        <div>*/}
                        {/*            <p className="text-sm text-gray-600 mb-1">Did they deserve it?</p>*/}
                        {/*            <LikertSlider leftLabel="Not at all" rightLabel="Completely" value={winnerDeserved} onChange={setWinnerDeserved} />*/}
                        {/*        </div>*/}
                        {/*        <div>*/}
                        {/*            <p className="text-sm text-gray-600 mb-1">Are you happy they won?</p>*/}
                        {/*            <LikertSlider leftLabel="Very unhappy" rightLabel="Very happy" value={winnerHappy} onChange={setWinnerHappy} />*/}
                        {/*        </div>*/}
                        {/*    </div>*/}
                        {/*</Question>*/}

                        {/*<Question label="If you had to replace one player, who would that be?">*/}
                        {/*    <RadioGroup vertical options={OTHER_PLAYER_OPTIONS} value={replacePlayer} onChange={setReplacePlayer} name="replace-player" />*/}
                        {/*</Question>*/}

                        {/*<Question label="If there were a team version of this game, who would you team up with?">*/}
                        {/*    <RadioGroup vertical options={OTHER_PLAYER_OPTIONS} value={teamPlayer} onChange={setTeamPlayer} name="team-player" />*/}
                        {/*</Question>*/}

                        {/*<Question label="Rank the players in the group in order of their performance.">*/}
                        {/*    <RankingQuestion ranking={ranking} onChange={setRanking} />*/}
                        {/*</Question>*/}

                        <Question label="How much do you agree with each of these statements?">
                            <div className="space-y-5">
                                {AI_ATTITUDE_STATEMENTS.map(({ key, text }) => (
                                    <div key={key}>
                                        <p className="text-sm text-gray-600 mb-1">{text}</p>
                                        <NumberScale
                                            min={1}
                                            max={5}
                                            leftLabel="Don't agree"
                                            rightLabel="Agree"
                                            value={aiAttitudes[key]}
                                            onChange={(v) => setAiAttitudes((prev) => ({ ...prev, [key]: v }))}
                                            name={`ai-attitude-${key}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </Question>

                        <Question label="Do you have any other comments about the game or your experience you would like to tell us?">
                            <textarea
                                rows={4}
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                                placeholder="Optional"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-y"
                            />
                        </Question>
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
