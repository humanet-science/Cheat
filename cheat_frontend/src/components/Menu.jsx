import React, { useState } from 'react';

export default function GameMenu({ ws, onQuit, onRestart }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      {/* Menu Button */}
      <div className="fixed top-4 left-4 z-50">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="hover:bg-amber-50 text-white p-2 hover:backdrop-blur-lg hover:text-gray-900 hover:backdrop-opacity-20 rounded-lg transition-all duration-300"
        >
          ☰ Menu
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute left-0 bg-amber-50 mt-2 w-48 rounded-lg z-50">
            <button
              onClick={() => {
                onRestart();
                setShowMenu(false);
              }}
              className="block w-full text-left px-4 py-2 hover:bg-amber-200 text-gray-900 rounded-t-lg transition-colors"
            >
							New Game
            </button>
            <button
              onClick={() => {
                onQuit();
                setShowMenu(false);
              }}
              className="block w-full text-left px-4 py-2 hover:bg-amber-200 text-gray-900 rounded-b-lg transition-colors"
            >
              Exit
            </button>
          </div>
        )}
      </div>

      {/* Click Outside Overlay */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMenu(false)}
        />
      )}
    </>
  );
}