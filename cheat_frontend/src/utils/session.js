// Per-tab session storage, used to resume a game after the page is refreshed.
// sessionStorage survives a reload but is private to the tab, so several tabs (e.g. local
// testing) never share a seat. Access is wrapped because storage can throw (private mode,
// blocked site data); the game still works without it, just without refresh-to-resume.

export const SESSION_KEYS = {
	token: "cheat_session_token",   // seat token for reconnecting to a running game
	prolificId: "cheat_prolific_id", // study only: needed by the exit survey
	gameId: "cheat_game_id",         // study only: needed by the exit survey
	studyPhase: "cheat_study_phase", // study only: 'game' | 'survey' | 'done'
};

export function getSession(key) {
	try {
		return sessionStorage.getItem(key);
	} catch (e) {
		return null;
	}
}

export function setSession(key, value) {
	try {
		if (value === null || value === undefined) {
			sessionStorage.removeItem(key);
		} else {
			sessionStorage.setItem(key, String(value));
		}
	} catch (e) {
		// Storage unavailable: resuming after a refresh won't work, but nothing else depends on it
	}
}

// The game is definitively over for this player: a refresh should no longer try to rejoin it
export function clearSessionToken() {
	setSession(SESSION_KEYS.token, null);
}
