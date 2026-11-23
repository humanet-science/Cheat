// Dev-only message-drop simulator, for testing the frontend's resilience to lost
// WebSocket messages (in either direction) without waiting to hit it by chance.
//
// Off by default even in dev — opt in per session via a query param:
//   ?dropMessages=cards_played:0.3,state:0.1
// Each entry is "<message type>:<drop probability 0-1>". Add &dropSeed=<int> to pin
// the PRNG so a run that finds a bug can be replayed exactly; omitting it reuses a
// fixed default seed, so a bare "?dropMessages=..." is itself already reproducible.
//
// Never active in a production build: gated on process.env.NODE_ENV, which
// react-scripts hardcodes to "production" for `yarn build` regardless of how the
// resulting bundle is deployed or configured.

let cachedConfig = null;

// mulberry32: minimal seeded PRNG. Deterministic from `seed`, so re-running with the
// same seed (and the same sequence of message types checked) reproduces the exact
// same drops.
function mulberry32(seed) {
	let a = seed;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function parseConfig() {
	if (cachedConfig) return cachedConfig;

	const params = new URLSearchParams(window.location.search);
	const spec = params.get('dropMessages');
	const rates = new Map();
	if (spec) {
		for (const part of spec.split(',')) {
			const [type, rate] = part.split(':');
			if (type && rate) rates.set(type.trim(), parseFloat(rate));
		}
	}

	const seed = parseInt(params.get('dropSeed'), 10) || 1;
	cachedConfig = {rates, rng: mulberry32(seed)};

	if (rates.size > 0) {
		console.warn('[chaos] message-drop simulation active:', Object.fromEntries(rates), 'seed:', seed);
	}

	return cachedConfig;
}

/**
 * Decide whether a message of the given type should be dropped right now.
 * @param {string} type - the message's `type` field
 * @param {'incoming'|'outgoing'} direction - only used for the console log
 * @returns {boolean} true if the caller should silently discard this message
 */
export function shouldDropMessage(type, direction) {
	if (process.env.NODE_ENV === 'production') return false;

	const {rates, rng} = parseConfig();
	const rate = rates.get(type);
	if (!rate) return false;

	const drop = rng() < rate;
	if (drop) {
		console.warn(`[chaos] dropping ${direction} message: ${type}`);
	}
	return drop;
}
