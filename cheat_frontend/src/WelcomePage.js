// WelcomePage.js
import React, {useState, useEffect} from 'react';
import {Logo} from './utils/Logo';
import {AVATARS} from "./utils/constants";

const WelcomePage = ({onJoinGame}) => {
    const [playerName, setPlayerName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [animationPhase, setAnimationPhase] = useState('drawing'); // 'drawing' | 'buttons-visible' | 'form-visible'
    const [showSubtitle, setShowSubtitle] = useState(false);
    const [gameMode, setGameMode] = useState('single');
    const [numPlayers, setNumPlayers] = useState(5);
    const [isWaiting, setIsWaiting] = useState(false);

    useEffect(() => {
        const subtitleTimer = setTimeout(() => {
            setShowSubtitle(true);
        }, 800);

        const drawingTimer = setTimeout(() => {
            setAnimationPhase('buttons-visible');
        }, 2000);

        return () => {
            clearTimeout(subtitleTimer);
            clearTimeout(drawingTimer);
        };
    }, []);

    const handleNewGameClick = () => {
        setAnimationPhase('form-visible');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (playerName.trim() && selectedAvatar && acceptedTerms) {
            onJoinGame(playerName.trim(), selectedAvatar, gameMode, numPlayers);
        }
    };

    return (<div
        className="min-h-screen bg-gradient-to-br from-green-900 to-blue-900 flex flex-col items-center justify-center p-4">
        <div className="relative w-full max-w-md h-96 mx-auto  border-red-500 border-2">

            {/* Logo Container */}
            <div className={`
                    w-full flex flex-col items-center  border-amber-100 border-2
                    transition-all duration-1000 ease-in-out
                    ${animationPhase === 'drawing' ? 'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/4' : animationPhase === 'buttons-visible' ? 'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2' : 'absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full'}
                `}>
                <div className="w-full max-w-md">
                    <Logo
                        className="mx-auto"
                        style={{width: "80%", height: "auto"}}
                        animationDuration="1.5s"
                    />
                </div>

                {/* Subtitle */}
                <div className={`
                        mt-1 transition-all duration-500 ease-in-out
                        ${showSubtitle ? 'opacity-100 h-auto' : 'opacity-0 h-auto'}
                    `}>
                    <p className="text-white text-xl md:text-2xl opacity-100 text-center">
                        The classic bluffing card game
                    </p>
                </div>
            </div>

            <div className={`flex border-2 border-amber-200 gap-4 w-full justify-center lex-col mt-8 transition-all duration-1000 ease-in-out 
                ${
                  animationPhase === 'buttons-visible'
                    ? 'opacity-100 top-1/2 -translate-y-20'
                    : 'opacity-0 top-1/2 translate-y-8'
                } `
            }>

            {/*/!* Action Buttons - Only show after drawing *!/*/}
            {/*{animationPhase === 'buttons-visible' && (*/}

                    <button
                        onClick={handleNewGameClick}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg"
                    >
                        New Game
                    </button>
                    <button
                        onClick={() => alert('Tutorial coming soon!')}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg"
                    >
                        Tutorial
                    </button>
            </div>


            {/* Welcome Box - Slides in when New Game is clicked */}
            <div className={`
                    w-full max-w-md mt-auto mb-8
                    transition-all ease-in-out transform z-10
                    ${animationPhase === 'form-visible' ? 'opacity-100 absolute top-5 mt-5 left-1/2 transform -translate-x-1/2 -translate-y-0 drop-shadow-lg' : 'opacity-0 absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-1/3'}
                    ${animationPhase === 'form-visible' ? 'flex-1 justify-start' : 'flex-0'}
                `} style={{transitionDuration: '1100ms'}}>

                {animationPhase === 'form-visible' && (
                    <div className="rounded-2xl bg-white p-8 max-w-md w-full shadow-2xl">

                        {/* Close Button */}
                            <button
                                onClick={() => setAnimationPhase('buttons-visible')}
                                className="absolute top-1 right-1 text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                <svg className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors m-1 p-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                        <form onSubmit={handleSubmit}>
                            {/* Player Name Input */}
                            <div className="mb-6 mt-3">
                                <input
                                    type="text"
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    placeholder="Enter a player name..."
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    maxLength={20}
                                    required
                                />
                            </div>

                            {/* Avatar Selection */}
                            <div className="mb-6">
                                <label className="block text-gray-500 text-sm font-bold mb-4">
                                    Choose your Avatar
                                </label>
                                <div
                                    className="overflow-x-auto scrollbar-thin border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <div className="flex gap-3" style={{minWidth: 'min-content'}}>
                                        {AVATARS.map((avatar, index) => (<button
                                            key={index}
                                            type="button"
                                            onClick={() => setSelectedAvatar(avatar)}
                                            className={`flex-shrink-0 text-4xl p-3 rounded-xl transform-gpu transition-transform ${selectedAvatar === avatar ? 'bg-blue-500 text-white scale-110 ring-4 ring-blue-300' : 'bg-gray-100 hover:bg-gray-200 hover:scale-110'}`}
                                        >
                                            {avatar}
                                        </button>))}
                                    </div>
                                </div>
                            </div>

                            {/* Game mode selection */}
                            <div className="mb-6">
                                <label className="block text-gray-500 text-sm font-bold mb-4">
                                    Game Mode
                                </label>
                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setGameMode('single')}
                                        className={`px-6 py-3 rounded-lg transition-colors ${gameMode === 'single' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700'}`}
                                    >
                                        Single Player
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setGameMode('multiplayer')}
                                        className={`px-6 py-3 rounded-lg transition-colors ${gameMode === 'multiplayer' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                    >
                                        Multiplayer
                                    </button>
                                </div>
                            </div>

                            {/* Number of players */}
                            <div className="mb-6">
                                <label className="block text-gray-500 text-sm font-bold mb-4">
                                    Number of Players
                                </label>
                                <div className="flex gap-2">
                                    {[3, 4, 5, 6].map((count) => (<button
                                        key={count}
                                        type="button"
                                        onClick={() => setNumPlayers(count)}
                                        className={`flex-1 py-3 rounded-lg transition-colors ${numPlayers === count ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                    >
                                        {count}
                                    </button>))}
                                </div>
                            </div>

                            {/* Terms and Conditions Checkbox */}
                            <div className="mb-6">
                                <label className="flex items-start space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={acceptedTerms}
                                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                                        className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                        required
                                    />
                                    <span className="text-sm text-gray-700">
                                            I consent that anonymised game play data will be collected for research purposes only. Click {' '}
                                        <button
                                            type="button"
                                            onClick={() => alert(`Anonymised play data will be stored for research purposes.`)}
                                            className="text-blue-600 hover:text-blue-800 underline focus:outline-none"
                                        >
                                                here
                                            </button> for details.
                                        </span>
                                </label>
                            </div>

                            {/* Join Button */}
                            <button
                                type="submit"
                                disabled={!playerName.trim() || !selectedAvatar || !acceptedTerms}
                                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
                            >
                                Join Game
                            </button>
                        </form>
                    </div>)}
            </div>
        </div>
    </div>);
};

export default WelcomePage;