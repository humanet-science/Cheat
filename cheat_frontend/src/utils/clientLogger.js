// Client-side diagnostics, sent to the server's /api/client_log endpoint and saved next to the game data
// (client_log.jsonl in the game's output folder).
//
// What is reported:
//   - console.error / console.warn calls (errors carry the last ~50 console lines for context)
//   - '[reconnect]' console lines (connection troubleshooting)
//   - uncaught errors and unhandled promise rejections
//   - React render crashes (via ErrorBoundary)
//   - tab visibility changes, online/offline events and page unloads
//   - UI snapshots, e.g. when a player is warned about or kicked for inactivity (see CheatGame)
//
// Ordinary console.log output is NOT sent (CheatGame logs every incoming message), only kept in a
// small rolling buffer that is attached to error reports.
//
// Reports go over HTTP rather than the game WebSocket, so they still arrive when the socket is the
// thing that broke; reports made while offline are retried. Each page load is capped, so a
// misbehaving client cannot flood the server.

import {getAPIBaseURL} from '../config';

const RECENT_LINES = 50;          // console lines kept for context
const MAX_LINE_LENGTH = 500;      // characters per console line
const MAX_ENTRIES_PER_PAGE = 300; // reports per page load
const FLUSH_DELAY_MS = 3000;      // batch reports for this long before sending
const MAX_PENDING = 100;          // reports held while offline

// Random id per page load, to group reports from one tab session (a refresh starts a new one)
const pageSessionId = Math.random().toString(36).slice(2, 10);

let context = {};      // game_id, player_id, prolific_id: set as they become known
let recent = [];       // rolling buffer of recent console lines
let pending = [];      // reports waiting to be sent
let reportedCount = 0; // reports accepted this page load
let flushTimer = null;
let installed = false;

const stringify = (arg) => {
	if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
	if (typeof arg === 'string') return arg;
	try {
		return JSON.stringify(arg);
	} catch (e) {
		return String(arg);
	}
};

const formatLine = (args) => {
	const text = args.map(stringify).join(' ');
	return text.length > MAX_LINE_LENGTH ? `${text.slice(0, MAX_LINE_LENGTH)}…` : text;
};

/** Add identifying information (game_id, player_id, prolific_id) to all subsequent reports */
export function setLogContext(partial) {
	context = {...context, ...partial};
}

/**
 * Queue a report.
 * @param kind short label, e.g. 'error', 'ui_snapshot'
 * @param data JSON-serialisable details
 * @param withRecent attach the recent console lines
 * @param immediate send now rather than batching
 */
export function report(kind, data = {}, {withRecent = false, immediate = false} = {}) {
	try {
		if (reportedCount >= MAX_ENTRIES_PER_PAGE) return;
		reportedCount++;
		pending.push({
			kind,
			client_time: new Date().toISOString(),
			visibility: document.visibilityState,
			online: navigator.onLine,
			...data,
			...(withRecent ? {recent_console: recent.slice()} : {}),
		});
		if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
		if (immediate) {
			flush();
		} else if (!flushTimer) {
			flushTimer = setTimeout(() => {
				flushTimer = null;
				flush();
			}, FLUSH_DELAY_MS);
		}
	} catch (e) {
		// Diagnostics must never break the game
	}
}

/** Send all queued reports. Use beacon=true when the page is being hidden or unloaded. */
export function flush({beacon = false} = {}) {
	if (!pending.length) return;
	const entries = pending.splice(0);
	const body = JSON.stringify({
		page_session_id: pageSessionId,
		user_agent: navigator.userAgent,
		...context,
		entries,
	});
	const url = `${getAPIBaseURL()}/api/client_log`;
	// text/plain keeps this a "simple" CORS request (no preflight), and is what sendBeacon can send
	try {
		if (beacon && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], {type: 'text/plain'}))) {
			return;
		}
		fetch(url, {method: 'POST', body, headers: {'Content-Type': 'text/plain'}, keepalive: body.length < 60000})
			.catch(() => {
				// Probably offline: put the reports back and try again later
				pending.unshift(...entries);
				if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
				if (!flushTimer) {
					flushTimer = setTimeout(() => {
						flushTimer = null;
						flush();
					}, FLUSH_DELAY_MS * 3);
				}
			});
	} catch (e) {
		// Diagnostics must never break the game
	}
}

/** Patch the console and register global listeners. Call once, before the app renders. */
export function installClientLogger() {
	if (installed) return;
	installed = true;

	for (const level of ['log', 'info', 'warn', 'error']) {
		const original = console[level].bind(console);
		console[level] = (...args) => {
			original(...args);
			try {
				const text = formatLine(args);
				recent.push({t: new Date().toISOString(), level, text});
				if (recent.length > RECENT_LINES) recent.shift();
				if (level === 'error') {
					report('console_error', {message: text}, {withRecent: true});
				} else if (level === 'warn') {
					report('console_warn', {message: text});
				} else if (text.startsWith('[reconnect]')) {
					report('reconnect', {message: text});
				}
			} catch (e) {
				// Diagnostics must never break the game
			}
		};
	}

	window.addEventListener('error', (e) => {
		report('uncaught_error', {
			message: String(e.message),
			source: e.filename ?? null,
			line: e.lineno ?? null,
			column: e.colno ?? null,
			stack: e.error?.stack ?? null,
		}, {withRecent: true});
	});
	window.addEventListener('unhandledrejection', (e) => {
		report('unhandled_rejection', {
			message: stringify(e.reason).slice(0, MAX_LINE_LENGTH),
			stack: e.reason?.stack ?? null,
		}, {withRecent: true});
	});

	// Tab switching / minimising: browsers throttle or freeze hidden tabs, which can drop the connection
	document.addEventListener('visibilitychange', () => {
		report('visibility', {state: document.visibilityState});
		if (document.visibilityState === 'hidden') flush({beacon: true});
	});
	window.addEventListener('online', () => report('network', {state: 'online'}));
	window.addEventListener('offline', () => report('network', {state: 'offline'}));
	window.addEventListener('pagehide', () => {
		report('pagehide', {});
		flush({beacon: true});
	});
}
