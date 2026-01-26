import React, {useEffect, useState} from "react";

const LoadingWindow = ({
                           handleCancelWaiting,
                           gameKey = null,
                           joinedHumans = 1,
                           isGameCreator = false,
                           totalSlots = null,
                       }) => {
    const [cardAnimationPhase, setCardAnimationPhase] = useState('top-pause');
    const [waitingDots, setWaitingDots] = useState('');

    // Cancel confirmation box: only appears if game creator wants to exit the queue
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    // Modified cancel handler
    const handleCancelClick = () => {
        if (isGameCreator) {
            setShowCancelConfirm(true);
        } else {
            handleCancelWaiting();
        }
    };

    const confirmCancel = () => {
        setShowCancelConfirm(false);
        handleCancelWaiting();
    };

    // Card animation sequence with pauses
    useEffect(() => {
        const sequence = [

            {phase: 'top-pause', duration: 200},   // (3) pause at top
            {phase: 'fanning-in', duration: 300},  // (4) collapse back down
            {phase: 'bottom-bounce-down', duration: 150},// (5) bounce at bottom
            //{phase: 'bottom-bounce-up', duration: 150},// (5) bounce at bottom
            //{phase: 'bottom', duration: 100}    ,   // (6) settle and pause
            // {phase: 'bottom', duration: 250},      // (1) start at bottom - pause
            {phase: 'fanning-out', duration: 500}, // (2) move up and fan out
        ];

        let currentStep = 0;

        const runSequence = () => {
            const step = sequence[currentStep];
            setCardAnimationPhase(step.phase);

            currentStep = (currentStep + 1) % sequence.length;

            setTimeout(runSequence, step.duration);
        };

        const timer = setTimeout(runSequence, 0);

        return () => clearTimeout(timer);
    }, []);

    // Waiting dots animation
    useEffect(() => {
        const dotsInterval = setInterval(() => {
            setWaitingDots(prev => prev === '...' ? '' : prev + '.');
        }, 500);
        return () => clearInterval(dotsInterval);
    }, []);

    // Sample cards for the animation
    const sampleCards = [{rank: 'A', suit: '♥', isRed: true}, {rank: 'K', suit: '♠', isRed: false}, {
        rank: 'Q', suit: '♦', isRed: true
    }, {rank: 'J', suit: '♣', isRed: false}, {rank: '10', suit: '♥', isRed: true}];

    // Calculate transform based on phase
    const getTransform = (index, phase) => {
        switch (phase) {
            case 'bottom':
                return `translateY(14px) rotate(0deg) translateX(0px)`;
            case 'fanning-out':
            case 'top-pause':
                return `translateY(-30px) rotate(${index * 15 - 30}deg) translateX(${index * 20 - 40}px)`;
            case 'fanning-in':
                return `translateY(10px) rotate(0deg) translateX(0px)`;
            case 'bottom-bounce-up':
                return `translateY(4px) rotate(${index * 1.3 - 2.6}deg) translateX(0px)`;
            case 'bottom-bounce-down':
                return `translateY(20px) rotate(0deg) translateX(0px)`;
            default:
                return `translateY(0px) rotate(0deg) translateX(0px)`;
        }
    };

    // Get transition timing for each phase
    const getTransition = (phase) => {
        switch (phase) {
            case 'fanning-out':
                return 'transform 0.5s ease-out'; // smooth ease going up
            case 'fanning-in':
                return 'transform 0.5s ease-in';  // smooth ease coming down
            case 'bottom-bounce-up':
                return 'transform 0.15s ease-out'; // quick bounce
            case 'bottom-bounce-down':
                return 'transform 0.15s ease-in'; // quick bounce
            default:
                return 'transform 0.1s ease-in-out'; // minimal transition for pauses
        }
    };

    return (<div
        className="fixed inset-0 bg-gradient-to-br from-green-900 to-blue-900 flex items-center justify-center z-50 overflow-hidden">

        <div className="text-center max-w-sm">

            {/* Card Animation Container */}
            <div className="flex justify-center mb-2 relative h-32 max-w">
                {sampleCards.map((card, index) => (<div
                    key={index}
                    className={`absolute w-16 h-24 bg-white rounded-lg border-2 drop-shadow-lg border-gray-400`}
                    style={{
                        transform: getTransform(index, cardAnimationPhase),
                        transformOrigin: (cardAnimationPhase === 'bottom' || cardAnimationPhase === 'bottom-bounce-up') ? 'bottom left' : 'center',
                        zIndex: index,
                        transition: getTransition(cardAnimationPhase)
                    }}
                >
                    {/* Card content */}
                    <div className="w-full h-full relative">
                        {/* Top-left corner */}
                        <div
                            className={`absolute top-1 left-1.5 text-sm leading-none ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
                            <div className="font-bold">{card.rank}</div>
                            <div className="text-base">{card.suit}</div>
                        </div>

                        {/* Center suit */}
                        <div
                            className={`absolute inset-0 flex items-center justify-center text-3xl ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
                            {card.suit}
                        </div>

                        {/* Bottom-right corner (upside down) */}
                        <div
                            className={`absolute bottom-1 right-1.5 text-sm leading-none transform rotate-180 ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
                            <div className="font-bold">{card.rank}</div>
                            <div className="text-base">{card.suit}</div>
                        </div>
                    </div>
                </div>))}
            </div>

            {/* Show game key */}
            {gameKey && (
                <>
                    <div className="text-white text-lg mb-5">
                        Share the game key <span
                        className="whitespace-nowrap bg-gradient-to-br from-yellow-400 to-green-400 px-2 py-1 rounded-lg font-mono">{gameKey}</span> with other players so they can join by clicking <span
                        className="inline-flex items-center justify-center gap-[1.3pt] whitespace-nowrap bg-gradient-to-br from-orange-400 to-pink-400 font-bold px-2 py-1 rounded-lg"><img src="/icons/link_icon.svg" className="w-5 h-5" alt=""/>Join Game
                        </span> from the homepage.
                    </div>
                </>
            )}

            {/* Waiting Text */}
            <div
                className={`text-white text-lg ${totalSlots && joinedHumans > 1 ? '' : 'mb-6'} flex items-center justify-center gap-1`}>
                <span>Waiting for others to join</span>
                <span className="w-8 text-left">{waitingDots}</span>
            </div>

            {/* Number of slots filled */}
            {totalSlots && joinedHumans > 1 && (
                <div className="text-yellow-500 text-sm mb-6 flex items-center justify-center gap-1">
                    <span>{joinedHumans} / {totalSlots} humans joined</span>
                </div>
            )}

            {/* Cancel Button */}
            <button
                onClick={handleCancelClick}
                className="bg-red-400 hover:bg-red-500 text-white px-4 py-1 rounded-lg transition-colors"
            >
                Cancel
            </button>

            {/* Cancel confirmation dialogue */}
            {showCancelConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-70">
                    <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 relative">
                        {/* Close Button */}
                        <button
                            onClick={() => setShowCancelConfirm(false)}
                            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 transition-colors z-10"
                        >
                            <svg
                                className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors p-1"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>

                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Cancel Game?</h2>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to cancel? This will close the game permanently.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelConfirm(false)}
                                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={confirmCancel}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg transition-colors"
                            >
                                Cancel Game
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>);
};

export default LoadingWindow;