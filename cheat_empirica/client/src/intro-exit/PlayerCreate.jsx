import React, {useState} from "react";

export function playerCreate({onPlayerID, connecting}) {
	// For the text input field.
	const [playerID, setPlayerID] = useState("");

	const sampleCards = [{rank: 'A', suit: '♥', isRed: true}, {rank: 'K', suit: '♠', isRed: false}, {
		rank: 'Q', suit: '♦', isRed: true
	}, {rank: 'J', suit: '♣', isRed: false}, {rank: '10', suit: '♥', isRed: true}];

	// Handling the player submitting their ID.
	const handleSubmit = (evt) => {
		evt.preventDefault();
		if (!playerID || playerID.trim() === "") {
			return;
		}

		onPlayerID(playerID);
	};

	return (
		<div className="min-h-screen flex items-center justify-center px-4" id="game-root">
			<div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-lg">

				{/*	/!* Game logo *!/*/}
				{/*<div className="inset-0 flex items-center justify-center pointer-events-none mb-4">*/}
				{/*	<Logo className="opacity-100" style={{width: "min(15rem, 50vw)", height: "auto"}}*/}
				{/*				fill='#6C727F'*/}
				{/*				animated={false}/>*/}
				{/*</div>*/}

				<div className="flex justify-center mb-2 mt-8 relative h-22 max-w">
					{sampleCards.map((card, index) => (<div
						key={index}
						className={`absolute w-13 h-18 bg-white rounded-lg border-2 border-gray-400`}
						style={{
							transform: `translateY(-30px) rotate(${index * 15 - 30}deg) translateX(${index * 20 - 40}px)`,
							zIndex: index
						}}
					>
						{/* Card content */}
						<div className="w-full h-full relative">
							{/* Top-left corner */}
							<div
								className={`absolute top-1 left-1.5 text-xs leading-none ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div className="font-bold">{card.rank}</div>
								<div className="text-xs">{card.suit}</div>
							</div>

							{/* Center suit */}
							<div
								className={`absolute inset-0 flex items-center justify-center text-lg ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
								{card.suit}
							</div>

							{/* Bottom-right corner (upside down) */}
							<div
								className={`absolute bottom-1 right-1.5 text-xs leading-none transform rotate-180 ${card.isRed ? 'text-red-600' : 'text-gray-900'}`}>
								<div className="font-bold">{card.rank}</div>
								<div className="text-xs">{card.suit}</div>
							</div>
						</div>
					</div>))}
				</div>

				<p className="text-2xl text-center font-bold text-gray-700 mb-4">
					Thank you for participating!
				</p>
				<p className="text-lg text-justify hyphens-auto text-gray-700 mb-6">
					This experiment is part of a research project conducted by the
					<a href="https://humanet.science" style={{"color": "#6DB4EE"}}> Humanet lab</a> at the
					London School of Economics and Political Science. The results will be presented at
					scientific meetings or published in scientific journals.
					<span className="font-bold"> All collected data is fully anonymised. </span>
				</p>

				<p className="text-lg text-left text-gray-700">
					To continue, please enter your Prolific ID:
				</p>

				<form action="#" method="POST" onSubmit={handleSubmit}>
					<fieldset disabled={connecting}>
						<div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-4 sm:px-0 px-6 transition-opacity">
							<input
								id="playerID"
								name="playerID"
								type="text"
								autoComplete="off"
								placeholder="Prolific ID"
								className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								required
								autoFocus
								value={playerID}
								onChange={(e) => setPlayerID(e.target.value)}
							/>

							<button
								type="submit"
								disabled={!playerID.trim()}
								className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                                text-white whitespace-nowrap font-bold py-3 px-6 rounded-lg transition-colors text-lg"
							>
								Submit
							</button>
						</div>
					</fieldset>
				</form>
			</div>
		</div>
	);
}
