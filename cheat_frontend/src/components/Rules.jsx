import React from "react";

export function Rules({showRules, setShowRules}) {
	if (!showRules) return null;
	return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
		<div className="bg-white rounded-2xl p-6 max-w-lg mx-4 max-h-[80vh] relative pr-1 pt-10">

			{/* Close Button */}
				<button
					onClick={() => setShowRules(false)}
					className="absolute top-1 right-1 text-gray-500 hover:text-gray-700 transition-colors z-10"
				>
					<svg className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors m-1 p-1"
							 fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>

			<div className="relative overflow-y-auto scrollbar-thin-v max-h-[calc(70vh-3rem)]">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-2xl font-bold text-gray-800">How to play</h2>

				</div>

				<div className="text-gray-700 space-y-4">
					<div>
						<ul className="list-disc list-inside space-y-2">
							<li>Players take turns playing 1-3 cards face down</li>
							<li>You must declare a single rank for all cards (e.g., "Three 7s")</li>
							<li>You can lie about what cards you're actually playing, but you must always declare the same rank as what's on the pile.
							</li>
							<li>The next player can call if they suspect you're lying</li>
							<li>If caught lying, you pick up the entire pile</li>
							<li>If falsely accused, the accuser picks up the pile and misses a turn</li>
							<li>After a call, a new rank is declared by the starting player</li>
							<li>Aces cannot be declared</li>
							<li>If you pick up four of a kind, they are automatically discarded (except Aces)</li>
						</ul>
					</div>

					<div>
						<h3 className="font-semibold text-lg">Winning</h3>
						<p>The first to get rid of all their cards wins the round!</p>
					</div>

					<div>
						<h3 className="font-semibold text-lg">Communicating</h3>
						<ul className="list-disc list-inside space-y-2">
						<li>Use the message feature to communicate with the others</li>
							<li>Click on another player's avatar to notify everyone of their hand count!</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>)
}

export function ExitConfirm ({showExitConfirm, setShowExitConfirm, onQuit}) {
	if (!showExitConfirm) return null;
	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
    <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 relative">
      {/* Close Button */}
      <button
        onClick={() => setShowExitConfirm(false)}
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

      <h2 className="text-2xl font-bold text-gray-800 mb-4">Exit Game?</h2>
      <p className="text-gray-600 mb-6">Are you sure you want to exit? Your progress will be lost.</p>

      <div className="flex gap-3">
        <button
          onClick={() => setShowExitConfirm(false)}
          className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onQuit();
            setShowExitConfirm(false);
          }}
          className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg transition-colors"
        >
          Exit Game
        </button>
      </div>
    </div>
  </div>
	)
}