import React from "react";
import Tutorial from "../../../../cheat_frontend/src/components/Tutorial";

import {useState} from "react";
import {usePlayer, useGame} from "@empirica/core/player/classic/react";
import {AVATARS} from "../../../../cheat_frontend/src/utils/constants.js";
import {
    PlayerNameInput, AvatarSelection, TermsCheckbox
} from "../../../../cheat_frontend/src/components/WelcomeBox.jsx";
import { useWebSocket } from '../WebSocketContext';

export function Introduction({next}) {

    const [showReady, setShowReady] = useState(false);
    const player = usePlayer();
    const game = useGame();
	const {setWs} = useWebSocket()

    const handleTutorialComplete = () => {
        setShowReady(true);
    };

    const handleJoinGame = (playerName, avatar) => {

        console.log("Participant submitting information:", playerName, avatar);

        // Create websocket
        const getWebSocketURL = () => {
            const hostname = window.location.hostname;

            // If accessing via localhost, connect to localhost
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'ws://localhost:5050/ws';
            }

            // If accessing via IP, connect to that IP
            return `ws://${hostname}:5050/ws`;
        };
        const ws = new WebSocket(getWebSocketURL());

		player.set("name", playerName);
		player.set("avatar", avatar);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            console.log("Message received during Introduction:", msg);

            if (msg.type === "player_registered") {
                console.log("Registration confirmed, moving to next stage");

                // Store websocket in context
				setWs(ws);

                // Clear the handler so Stage.jsx can set its own
				ws.onmessage = null;

                next();
            }
        };

        ws.onopen = () => {
            console.log("WebSocket connected in survey welcome page; id: ", ws);
            ws.send(JSON.stringify({
                type: "empirica_join",
                name: playerName,
                avatar: avatar,
                game_id: game.scope.id,
                empirica_id: player.id
            }));
        };
    }

    if (showReady) {
        return (<div className="cheat" id="game-root">
            <ReadyScreen onReady={handleJoinGame}/>
        </div>);
    }

    return (<div className="cheat" id="game-root">
        <Tutorial
            onClose={handleTutorialComplete}
            isEmpirica={true}
        />
    </div>);
}

function ReadyScreen({onReady}) {

    // Player name and avatar
    const [playerName, setPlayerName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('');

    // Has accepted the T&Cs
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (playerName.trim() && selectedAvatar && acceptedTerms) {
            onReady(playerName.trim(), selectedAvatar);
        }
    };

    return (<div
        className="cheat flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-900 to-blue-900"
        id="game-root">
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-8 max-w-md w-full shadow-2xl">

            {/* Player name selection*/}
            <PlayerNameInput playerName={playerName} setPlayerName={setPlayerName}/>

            {/* Avatar Selection */}
            <AvatarSelection
                selectedAvatar={selectedAvatar}
                setSelectedAvatar={setSelectedAvatar}/>

            {/* Terms and Conditions Checkbox */}
            <TermsCheckbox
                acceptedTerms={acceptedTerms}
                setAcceptedTerms={setAcceptedTerms}
            />

            {/* Join Button */}
            <button
                type="submit"
                disabled={!playerName.trim() || !selectedAvatar || !acceptedTerms}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed
					text-white font-bold py-4 px-6 rounded-lg transition-colors text-lg"
            >
                Join Game
            </button>
        </form>
    </div>);
}