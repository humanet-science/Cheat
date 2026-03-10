import React from "react";

export function Consent({onConsent}) {
	// return (
	// 	<div className="min-h-screen flex items-center justify-center px-4" id="game-root">
	// 		<div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-lg">
	// 			<h1 className="text-2xl font-bold text-gray-500 mb-4">
	// 				Consent form
	// 			</h1>
	// 			<p className="text-lg text-justify text-gray-600 mb-4">
	// 				This experiment is part of a scientific project conducted at the
	// 				<a href="https://humanet.science" style={{"color": "#6DB4EE"}}> Humanet lab</a> the
	// 				London School of Economics and Political Science.
	//
	// 			</p>
	// 			<p className="text-lg text-justify text-gray-600 mb-4">
	// 				There are no known or anticipated risks to participating in this experiment. There is no way for us
	// 				to identify you. The only information we collect is anonymised, timestamped data
	// 				of your actions on this site, and your survey responses. The results of our research may be presented at
	// 				scientific meetings or published in scientific journals.
	// 			</p>
	//
	// 			{/*<p className="text-lg text-justify text-gray-600 mb-4">*/}
	// 			{/*	Clicking on the "I consent" button indicates that you are at least 18 years of age, and*/}
	// 			{/*	agree to participate voluntarily.*/}
	// 			{/*</p>*/}
	// 			<div>
	// 			<button
	// 				className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
  //                               text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
	// 				type="button" onClick={onConsent}>
	// 				I understand
	// 			</button>
	// 		</div>
	// 		</div>
	//
	// 	</div>
	// );

	// Auto-consent and skip this page
  React.useEffect(() => {
    onConsent(); // Auto-consent immediately
  }, [onConsent]);

  return null; // Don't render anything
}
