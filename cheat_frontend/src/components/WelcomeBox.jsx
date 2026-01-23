import React from 'react';
import { AVATARS } from '../utils/constants';

export function PlayerNameInput({ playerName, setPlayerName }) {
  return (
    <div className="mb-6 mt-3">
      <input
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="Choose a player name ..."
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        maxLength={20}
        required
      />
    </div>
  );
}

export function AvatarSelection({ selectedAvatar, setSelectedAvatar }) {
  return (
    <div className="mb-6">
      <label className="block text-gray-500 text-sm font-bold mb-4">
        Choose your Avatar
      </label>
      <div className="overflow-x-auto scrollbar-thin border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
          {AVATARS.map((avatar, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setSelectedAvatar(avatar)}
              className={`flex-shrink-0 text-4xl p-3 rounded-xl transform-gpu transition-transform ${
                selectedAvatar === avatar
                  ? 'bg-blue-500 text-white scale-110 ring-4 ring-blue-300'
                  : 'bg-gray-100 hover:bg-gray-200 hover:scale-110'
              }`}
            >
              {avatar}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TermsCheckbox({ acceptedTerms, setAcceptedTerms }) {
  return (
    <div className="mb-6">
      <label className="flex items-start space-x-3">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="form-checkbox mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
          required
        />
        <span className="text-sm text-gray-700">
          I consent that anonymised game play data will be stored for research purposes. Click{' '}
          <button
            type="button"
            onClick={() => alert('Anonymised play data will be stored for research purposes.')}
            className="text-blue-600 hover:text-blue-800 underline focus:outline-none"
          >
            here
          </button>{' '}
          for details.
        </span>
      </label>
    </div>
  );
}