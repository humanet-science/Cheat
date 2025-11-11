import React from "react";
import CheatGame from "./CheatGame";

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-blue-900">
      <CheatGame />

			     {/* Logo and Humanet text in bottom right corner */}
      <div className="fixed bottom-4 right-4 flex items-center space-x-2 px-3 py-2 z-0">
        <img
          src="/icons/LSE_logo.svg"
          alt="Humanet Logo"
          className="w-10 h-10"
        />
				<div className="h-10 border-l border-gray-400"></div>
        <span className="pl-0 text-gray-200 font-light text-2xl">Humanet Lab</span>
      </div>

    </div>

  );
}

export default App;