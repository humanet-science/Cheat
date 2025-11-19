import React, {useState} from 'react';
import {Rules, ExitConfirm} from "./Rules";

export default function GameMenu({onQuit}) {
	const [showMenu, setShowMenu] = useState(false);
	const [showRules, setShowRules] = useState(false);
	const [showExitConfirm, setShowExitConfirm] = useState(false);
	return (<>

		{/* Menu Button with Animated Hamburger */}
		<div className="fixed top-4 left-4 z-50">
			<button
				onClick={() => setShowMenu(!showMenu)}
				className="relative w-12 h-12 flex items-center justify-center group"
			>
				{/* Animated Hamburger/X */}
				<div className="relative w-6 h-6">
            <span
							className={`absolute left-0 w-6 h-0.5 bg-gray-200 transition-all duration-300 ${showMenu ? 'rotate-45 top-3' : 'top-1'}`}/>
					<span
						className={`absolute left-0 w-6 h-0.5 bg-gray-200 top-3  transition-opacity duration-300 ${showMenu ? 'opacity-0' : 'opacity-100'}`}/>
					<span
						className={`absolute left-0 w-6 h-0.5 bg-gray-200 transition-all duration-300 ${showMenu ? '-rotate-45 top-3' : 'top-5'}`}/>
				</div>
			</button>

			{/* Animated Menu Box */}
			<div
				className={`absolute left-0 mt-2 backdrop-blur-lg bg-amber-50/50 shadow-xl rounded-xl overflow-hidden transition-all duration-500 ${showMenu ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
				<div className="w-36">
					<a
						href="https://humanet.science/"
						target="_blank"
						rel="noopener noreferrer"
						onClick={() => setShowMenu(false)}
						className="block w-full text-left px-4 py-3 hover:bg-amber-200/30 text-gray-900 transition-all duration-200 border-b border-amber-200/30"
					>
						About us
					</a>

					{/* Rules - Opens rules modal */}
					<button
						onClick={() => {
							setShowRules(true);
							setShowMenu(false);
						}}
						className="block w-full text-left px-4 py-3 hover:bg-amber-200/30 text-gray-900 transition-all duration-200 border-b border-amber-200/30"
					>
						Rules
					</button>

					{/* Exit button */}
					<button
						onClick={() => {
							setShowExitConfirm(true);
    setShowMenu(false);
						}}
						className="block w-full text-left px-4 py-3 hover:bg-amber-200/30 text-gray-900 transition-all duration-200"
					>Exit
					</button>
				</div>
			</div>
		</div>

		{/* Click Outside Overlay (transparent) */}
		{showMenu && (<div
			className="fixed inset-0 z-40"
			onClick={() => setShowMenu(false)}
		/>)}

		<Rules showRules={showRules} setShowRules={setShowRules}/>
		<ExitConfirm showExitConfirm={showExitConfirm}
								 setShowExitConfirm={setShowExitConfirm}
								 onQuit={onQuit}/>
	</>);
}