import React, {useCallback, useEffect, useRef, useState,} from "react";
import confetti from "canvas-confetti";
import PlayerHand from './components/CheatGame/PlayerHand';

// Animations
import CardFlyAnimation from "./components/CheatGame/Animations/CardFly";
import PilePickUpAnimation from "./components/CheatGame/Animations/PilePickUp";
import DiscardAnimation from "./components/CheatGame/Animations/Discard";
import {CardDeal, useCardDealAnimation} from './components/CheatGame/Animations/CardDeal';

// Components
import {CardRevealOverlay, ConnectionDroppedOverlay, GameOverOverlay, GameStartOverlay, TimeoutWarningOverlay} from "./components/CheatGame/GameOverlay";
import StatusMessage from "./components/CheatGame/StatusMessages";
import {OpponentIcons} from "./components/CheatGame/Opponent";
import {CenterPile} from "./components/CheatGame/Pile";
import GameMenu from './components/Menu';

// Hooks and utils
import {getPlayerColor, parseCard} from './utils/cardUtils';
import {WS_URL} from './config';
import {usePlayerPositions} from "./utils/PlayerPositions";
import {soundManager} from './utils/soundManager';
import {useActionQueue} from './components/CheatGame/hooks/useActionQueue';
import {useScreenSize} from "./components/CheatGame/hooks/useScreenSize";
import {Logo} from './utils/Logo';

// Constants
import {VALID_RANKS} from "./utils/constants";

/**
 * Main Cheat card game component
 *
 * Handles game state, player interactions, animations, and WebSocket communication.
 * Can be used standalone or embedded in contexts like Tutorial or experiments.
 *
 * @param {WebSocket} socket - WebSocket connection for real-time game communication
 * @param {Object} gameConfig - Game configuration object:
 *   - numPlayers: total number of players in game
 *   - experimentalMode: boolean for experimental features
 *   - predefinedMessages: array of allowed chat messages
 *   - selfId: current player's ID
 * @param {Object} currentRound - Current round state from backend
 * @param {Function} onUpdateRound - Callback to update round state
 * @param {Function} onExitGame - Callback when player exits game
 * @param {boolean} [highlightMenu=false] - Whether to highlight menu (used in Tutorial)
 * @param {number|null} [containerWidth=null] - Override container width for player positioning.
 *   Used in Tutorial where game is scaled/transformed. If null, uses window width.
 * @param {number|null} [containerHeight=null] - Override container height for player positioning.
 *   Used in Tutorial where game is scaled/transformed. If null, uses window height.
 * @param {number|null} [tutorialScale=null] - Scale factor for Tutorial context (e.g., 0.7).
 *   Passed to StatusMessage component to properly scale and position floating messages.
 */
export default function CheatGame({
																		socket,
																		gameConfig,
																		currentRound,
																		onUpdateRound,
																		onExitGame,
																		highlightMenu = false,
																		onFinish = null,
																		containerWidth = null,
																		containerHeight = null,
																		tutorialScale = null,
																		showDealAnimation = true,
																		disableReconnect = false,
																	}) {

	// Game state and previous state
	const [state, setState] = useState(currentRound?.state || null);
	const prevStateRef = useRef(null);

	// Player hand selection
	const [selectedCards, setSelectedCards] = useState([]);
	const [declaredRank, setDeclaredRank] = useState("");

	// Whether the player has selected a rank and played
	const [hasActed, setHasActed] = useState(currentRound?.hasActed || false);

	// Whether the rank input box should be shown
	const [showRankInput, setShowRankInput] = useState(false);

	// Whether it is the player's turn
	const [isMyTurn, setIsMyTurn] = useState(currentRound?.currentPlayer === gameConfig.selfId);

	// Opponent player information
	const [opponents, setOpponents] = useState([]);

	// ActionQueue processes incoming messages sequentially
	const {
		actionQueue, setActionQueue, processingRef, addToQueue, processNext, removeProcessed
	} = useActionQueue();

	// Use the persistent data from props
	const {experimentalMode, numPlayers, selfId, predefinedMessages} = gameConfig;

	// New round
	const [isNewRound, setIsNewRound] = useState(true);

	// Track input error
	const [rankError, setRankError] = useState(false);

	// Track game over
	const [gameOver, setGameOver] = useState(false);
	const [winner, setWinner] = useState(null);
	const [hasClickedNextRound, setHasClickedNextRound] = useState(false);

	// Track experiment over (experimental mode only)
	const [experimentOver, setExperimentOver] = useState(false);

	// Track connection dropped / reconnecting / reconnected flash
	const [connectionDropped, setConnectionDropped] = useState(false);
	const [isReconnecting, setIsReconnecting] = useState(false);
	const [showReconnected, setShowReconnected] = useState(false);

	// Idle timeout warning (seconds remaining when server sent the reminder)
	const [timeoutRemaining, setTimeoutRemaining] = useState(null);

	// Active socket (may be replaced on reconnect)
	const [activeSocket, setActiveSocket] = useState(socket);
	useEffect(() => { setActiveSocket(socket); }, [socket]);

	// Session token for reconnection (persisted in localStorage by the queue phase)
	const sessionTokenRef = useRef(localStorage.getItem('cheat_session_token'));

	// Ping watchdog: if no ping arrives for 25s the connection is silently dead.
	// Calls attemptReconnect directly — don't rely on onclose, which won't fire if
	// the network is down and the close handshake can't complete.
	const lastPingRef = useRef(Date.now());
	const pingWatchdogRef = useRef(null);
	const reconnectingRef = useRef(false); // guard against double-triggering reconnect
	const serverErrorRef = useRef(false);  // set on server_error to permanently suppress reconnect
	// Incremented whenever the action queue is forcibly cleared (reconnect). Any
	// processActionQueue call that started before the clear sees a stale generation
	// and skips its removeProcessed() / recursive call so it can't corrupt the new queue.
	const queueGenerationRef = useRef(0);
	const pendingMessagesRef = useRef([]); // messages that arrive on new socket before React sets up onmessage
	// When the network comes back (online event), this resolves the current retry delay
	// immediately instead of waiting for a throttled setTimeout to fire.
	const retryNowRef = useRef(null);
	// Called to abort a running reconnect loop when the active socket proves it's still alive
	// (i.e. a message arrives on it while we're attempting to reconnect).
	const cancelReconnectRef = useRef(null);
	// Ref always tracking the *current* active socket. Used inside onclose/offline handlers
	// to discard events from old sockets that fire after a swap (race vs. React cleanup).
	const activeSocketRef = useRef(socket);
	useEffect(() => { activeSocketRef.current = activeSocket; }, [activeSocket]);

	// Track seconds remaining until game resets
	const [countdown, setCountdown] = useState(null);
	const [confirmedCount, setConfirmedCount] = useState(0);
	const [totalHumans, setTotalHumans] = useState(0);

	// Animation states
	const [animatingCards, setAnimatingCards] = useState(null); // {playerId, cards, targetPosition, starting x, starting y}
	const [revealedCards, setRevealedCards] = useState(null); // {cards, wasLying}
	const [pilePickupAnimation, setPilePickupAnimation] = useState(null);
	const [isDealingCards, setIsDealingCards] = useState(true);
	const [dealtCards, setDealtCards] = useState(0);
	const [dealingFromCenter, setDealingFromCenter] = useState(showDealAnimation);
	const [centerDealCards, setCenterDealCards] = useState([]);
	const [showLetsGo, setShowLetsGo] = useState(false);

	// Cards on the pile
	const [pileCards, setPileCards] = useState([]);

	// Number of cards played in last hand, so that we can highlight them when it's time to call a bluff
	const [lastPlayedCount, setLastPlayedCount] = useState(0);

	// Discarded ranks
	const [discards, setDiscards] = useState([]); // Track all discarded ranks
	const [discardAnimation, setDiscardAnimation] = useState(null); // {playerId, rank}

	// Player status messages
	const [statusMessages, setStatusMessages] = useState([]);
	const [playAnnouncements, setPlayAnnouncements] = useState([]);
	const [speakingPlayers, setSpeakingPlayers] = useState(new Set());
	const [messageInput, setMessageInput] = useState("");

	// Use containerWidth/containerHeight if provided, otherwise fall back to window
	const {width: windowWidth, height: windowHeight} = useScreenSize();
	const width = containerWidth ?? windowWidth;
	const height = containerHeight ?? windowHeight;

	// Positions of the players at the table: these are dynamically adapted to the screen dimensions
	// We also need a const playerPositions array to trigger re-renders when the screen changes
	const {playerPositions, playerPositionsRef, tableCenter} = usePlayerPositions(
		numPlayers, selfId, width, height, isMyTurn, hasActed, state.your_info.hand
	);

	// Card Dealing animation
	useCardDealAnimation({
		state,
		selfId,
		dealingFromCenter,
		showDealAnimation,
		setCenterDealCards,
		setDealtCards,
		setDealingFromCenter,
		setShowLetsGo,
		setIsDealingCards,
		soundManager
	});

	// Load sounds (idempotent — safe to call even if LoadingWindow already loaded them)
	useEffect(() => { soundManager.loadAll(); }, []);

	// Attempt to reconnect using the stored session token.
	// Keeps retrying every 2s until the server confirms (success) or explicitly rejects
	// the token (slot expired) — rather than giving up after a fixed number of attempts.
	// This handles the case where wifi is still off during early retries.
	const attemptReconnect = useCallback(async () => {
		if (reconnectingRef.current) return;
		if (serverErrorRef.current) return;
		reconnectingRef.current = true;

		const token = sessionTokenRef.current;
		if (!token) { reconnectingRef.current = false; setConnectionDropped(true); return; }

		// Block interaction immediately — the visual spinner appears after a short delay
		// so instant reconnects don't flash the badge, but clicks are always swallowed.
		setIsReconnecting(true);

		let cancelled = false;
		cancelReconnectRef.current = () => {
			cancelled = true;
			retryNowRef.current?.(); // wake up any sleeping retry delay immediately
		};

		const MAX_DURATION = 60000;
		const startTime = Date.now();

		while (!cancelled && Date.now() - startTime < MAX_DURATION) {
			const result = await new Promise((resolve) => {
				const ws = new WebSocket(WS_URL);
				let settled = false;
				const finish = (outcome, newWs = null, buf = null) => {
					if (settled) return;
					settled = true;
					if (outcome !== 'confirmed') ws.close();
					resolve({outcome, ws: newWs, buffer: buf});
				};
				const timer = setTimeout(() => finish('timeout'), 4000);
				const buffer = [];
				ws.onopen = () => ws.send(JSON.stringify({type: 'reconnect', token}));
				ws.onmessage = (e) => {
					clearTimeout(timer);
					const msg = JSON.parse(e.data);
					if (msg.type === 'reconnect_confirmed') {
						// Include reconnect_confirmed in the buffer so the game's onmessage
						// handler can clear stale pre-disconnect queue items before the
						// server's state update is applied.
						buffer.push(msg);
						ws.onmessage = (e2) => buffer.push(JSON.parse(e2.data));
						finish('confirmed', ws, buffer);
					} else if (msg.type === 'reconnect_failed') {
						// Server has no slot yet — it hasn't detected our disconnect yet
						// (ping timeout takes ~15s). Treat as retriable, not terminal.
						finish('error');
					}
				};
				ws.onerror = () => { clearTimeout(timer); finish('error'); };
				ws.onclose = () => { clearTimeout(timer); finish('error'); };
			});

			if (cancelled) { result.ws?.close(); break; }

			if (result.outcome === 'confirmed') {
				cancelReconnectRef.current = null;
				pendingMessagesRef.current = result.buffer;
				setConnectionDropped(false);
				setActiveSocket(result.ws);
				setIsReconnecting(false);
				reconnectingRef.current = false;
				setShowReconnected(true);
				setTimeout(() => setShowReconnected(false), 2000);
				return;
			}

			// Connection error, timeout, or no slot yet — wait and retry.
			// retryNowRef lets the 'online' event skip a throttled timer immediately.
			console.log('[reconnect] attempt outcome:', result.outcome, '— retrying in 2s');
			await new Promise(r => {
				const t = setTimeout(r, 2000);
				retryNowRef.current = () => { clearTimeout(t); r(); };
			});
			retryNowRef.current = null;
		}

		cancelReconnectRef.current = null;
		reconnectingRef.current = false;
		if (!cancelled) {
			setIsReconnecting(false);
			setConnectionDropped(true);
		} else if (activeSocketRef.current?.readyState !== WebSocket.OPEN) {
			// The socket that triggered the cancel is actually dead (e.g. a server-side
			// close arrived right after the last message that fired the cancel). Start a
			// fresh reconnect attempt rather than leaving the user silently disconnected.
			setIsReconnecting(false);
			attemptReconnect();
		} else {
			setIsReconnecting(false);
		}
	}, []);

	// Ping watchdog — separate effect so it only resets when the socket changes,
	// not on every render caused by onUpdateRound getting a new reference.
	useEffect(() => {
		if (!activeSocket || disableReconnect) return;
		lastPingRef.current = Date.now();
		clearInterval(pingWatchdogRef.current);
		pingWatchdogRef.current = setInterval(() => {
			if (Date.now() - lastPingRef.current > 25000) {
				clearInterval(pingWatchdogRef.current);
				try { activeSocket.close(); } catch(e) {}
				if (!gameOver) attemptReconnect();
			}
		}, 5000);
		return () => clearInterval(pingWatchdogRef.current);
	}, [activeSocket]); // eslint-disable-line react-hooks/exhaustive-deps

	// On macOS Chrome/Brave, WebSocket onclose doesn't fire immediately when wifi drops —
	// the browser keeps the socket in OPEN state until the close handshake completes.
	// The offline event fires immediately and lets us trigger reconnect right away.
	// Guard with navigator.onLine: Chromium can fire the offline event with a delay, after
	// wifi has already returned. In that case onLine is true and we skip the spurious reconnect.
	//
	// The online handler skips the throttled retry delay so reconnect attempts resume
	// immediately when the network returns, rather than waiting for a possibly-throttled
	// setTimeout to fire (Chromium/Brave can delay timers significantly under certain conditions).
	useEffect(() => {
		if (disableReconnect) return;
		const handleOffline = () => {
			console.log('[reconnect] offline fired — onLine:', navigator.onLine,
				'reconnecting:', reconnectingRef.current,
				'socketState:', activeSocketRef.current?.readyState);
			if (!gameOver && !navigator.onLine) attemptReconnect();
		};
		const handleOnline = () => {
			console.log('[reconnect] online fired — reconnecting:', reconnectingRef.current);
			retryNowRef.current?.();
		};
		window.addEventListener('offline', handleOffline);
		window.addEventListener('online', handleOnline);
		return () => {
			window.removeEventListener('offline', handleOffline);
			window.removeEventListener('online', handleOnline);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Set up WebSocket handlers for gameplay only
	useEffect(() => {
		if (activeSocket) {
			// Drain messages buffered during the handoff gap (initial start or reconnect).
			// _initialBuffer: set by StudyFlow before CheatGame mounts (handles server messages
			// sent between new_round and this effect running).
			// pendingMessagesRef: set by attemptReconnect for reconnection handoffs.
			const initialBuf = activeSocket._initialBuffer ?? [];
			delete activeSocket._initialBuffer;
			const flush = [...initialBuf, ...pendingMessagesRef.current.splice(0)];
			if (flush.length > 0) {
				setHasActed(false);
				setSelectedCards([]);
				setDeclaredRank('');
			}

			activeSocket.onmessage = (event) => {
				let msg;
				try {
					msg = JSON.parse(event.data);
				} catch (e) {
					console.error('CheatGame: failed to parse message', event.data, e);
					return;
				}

				// Ping-pong with backend to keep connection alive
				if (msg.type === 'ping') {
					lastPingRef.current = Date.now();
					activeSocket.send(JSON.stringify({type: 'pong'}));
				}

				// Any message on the active socket proves it's still alive.
				// If we're stuck in a reconnect loop (e.g. triggered by a brief offline
				// event while the server never detected a drop), cancel it immediately.
				if (reconnectingRef.current) {
					console.log('[reconnect] active socket still alive — cancelling reconnect loop');
					cancelReconnectRef.current?.();
				}

				if (msg.type === 'ping') return;

				try {

				console.log("CheatGame received gameplay message:", msg);

				if (msg.type === 'session_token') {
					sessionTokenRef.current = msg.token;
					localStorage.setItem('cheat_session_token', msg.token);
					return;
				}

				if (msg.type === 'reconnect_confirmed') {
					// Clear stale pre-disconnect queue items and invalidate any
					// processActionQueue call currently suspended mid-await, so its
					// eventual removeProcessed() doesn't eat the first item of the new queue.
					queueGenerationRef.current++;
					setActionQueue([]);
					processingRef.current = false;
					setAnimatingCards(null);

					// Check if a 'new_round' message was missed
					if (prevStateRef.current?.current_round !== msg?.current_round) {
						setCountdown(null);
						setConfirmedCount(0);
						setTotalHumans(0);
						setWinner(null);
						setGameOver(false);
						setHasClickedNextRound(false);
						removeAllConnectionTimers();
						setSpeakingPlayers(new Set());
          	if (msg.current_player === msg.your_info?.id) setHasActed(false);
          	setIsMyTurn(msg.current_player === msg.your_info?.id);
      	  }

					return;
				}

				if (msg.type === 'reconnect_failed') {
					setConnectionDropped(true);
					return;
				}

				if (msg.type === 'new_round') {
					console.log("Setting up a new round", msg);
					const {type, ...currentState} = msg;
					setState(currentState);
					setCountdown(null);
					setConfirmedCount(0);
					setTotalHumans(0);
					setWinner(null);
					setGameOver(false);
					setHasClickedNextRound(false);
					removeAllConnectionTimers();
					setSpeakingPlayers(new Set());
					if (msg.current_player === msg.your_info.id) {
						setHasActed(false);
					}
					setIsMyTurn(msg.current_player === msg.your_info.id);
					if (showDealAnimation) {
						setCenterDealCards([]);
						setDealtCards(0);
						setIsDealingCards(true);
						setDealingFromCenter(true);
					}
				}

				if (["state", "state_update", "cards_played", "bluff_called", "discard", "round_over", "bot_message", "catch_up"].includes(msg.type)) {
					addToQueue(msg);
				}

				if (msg.type === "human_message") {
					addStatusMessage(msg.sender_id, msg.message);
				}

				if (msg.type === "countdown") {
					setCountdown(msg.seconds_remaining);
					setConfirmedCount(msg.confirmed_count);
					setTotalHumans(msg.total_humans);
					setIsMyTurn(false);

					// Add a connection info to the missing players for those players waiting to join
					if (!msg.waiting_for_players.includes(state.your_info.id)) {
						// Clear all connection timers first
						removeAllConnectionTimers();

						// Add timers only for players still waiting
						for (const playerId of msg.waiting_for_players) {
							addStatusMessage(playerId, `Waiting for connection (${msg.seconds_remaining}s)`, false, true);
						}
					}
					if (msg.seconds_remaining === 0) {
						removeAllConnectionTimers();
					}
				}
				if (msg.type === "server_error") {
					serverErrorRef.current = true;
					setConnectionDropped(true);
					setIsReconnecting(false);
				}
				if (msg.type === "timeout_reminder") {
					setTimeoutRemaining(msg.time_remaining);
				}
				if (msg.type === "player_reconnecting") {
					addStatusMessage(msg.player_id, "Reconnecting...", false, true);
				}
				if (msg.type === "player_reconnect_resolved") {
					removeConnectionTimer(msg.player_id);
				}
				if (msg.type === "quit_confirmed") {
					setTimeoutRemaining(null);
					removeConnectionTimer(state.your_info.id);
					if (experimentalMode) {
						setExperimentOver(true);
						// Don't exit yet — user must click Finish
					} else {
						onExitGame();
					}
				}
				} catch (e) {
					console.error('CheatGame: error processing message', msg, e);
				}
			};

			activeSocket.onerror = (error) => {
				console.error("CheatGame WebSocket error:", error);
			};

			activeSocket.onclose = (event) => {
				// Guard against stale onclose from a replaced socket firing after the swap.
				// activeSocketRef.current is always the latest socket; if this socket has
				// been replaced, the close event is spurious (same root cause as Chrome's
				// delayed onclose, also observed in Brave).
				const isCurrent = activeSocket === activeSocketRef.current;
				console.log('[reconnect] onclose fired — code:', event.code, 'isCurrent:', isCurrent,
					'reconnecting:', reconnectingRef.current, 'gameOver:', gameOver);
				if (!isCurrent) return;
				if (!gameOver && !disableReconnect) attemptReconnect();
			};

			// Flush messages buffered during reconnect through the now-live handler
			for (const msg of flush) {
				activeSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(msg) }));
			}

			// Null out onclose when this socket is replaced, so a delayed Chrome onclose
			// fired after the socket swap doesn't trigger a spurious reconnect attempt.
			return () => { activeSocket.onclose = null; };
		}
	}, [activeSocket, onUpdateRound])

	// Process actions sequentially, and hold actions until animations have finished playing for a smoother
	// game play
	const processActionQueue = async () => {

		if (processingRef.current || animatingCards || dealingFromCenter || isDealingCards) return;

		// Snapshot the queue generation. If a reconnect clears the queue while we're
		// suspended in an await, the generation will have changed and we abort before
		// calling removeProcessed() so we don't eat the first item of the new queue.
		const generation = queueGenerationRef.current;

		// Get the next action
		const msg = processNext();

		// Pause if the relevant player is currently speaking
		if (["cards_played", "bluff_called", "bot_message", "discard"].includes(msg.type)) {
			if (msg && (msg.current_player || msg.sender_id || msg.caller)) {
				const playerId = msg.sender_id || msg.caller || msg.current_player;
				if (playerId && speakingPlayers.has(playerId)) {
					return;
				}
			}
		}

		// Process the action
		processingRef.current = true;
		if (msg.type === "state") {

			// Get the previous state
			const {type, ...currentState} = msg;
			const prevState = prevStateRef.current;

			// First, sync declaredRank with backend so that the declared rank always matches
			// what people are currently playing. If this is NULL, it means a new round has started and a new
			// rank can be declared.
			if (msg.current_rank !== null) {
				setDeclaredRank(msg.current_rank);
			} else if (prevState?.your_info.id === msg.current_player) {
				setDeclaredRank("");
			}

			// Update the previous state
			prevStateRef.current = currentState;
			setState(currentState);

			// Reset hasActed if it becomes your turn
			if (msg.current_player === msg.your_info.id) {
				setHasActed(false);
			}
			setIsMyTurn(msg.current_player === msg.your_info.id);

			// Small delay to let state update
			await new Promise(r => setTimeout(r, 100));

		} else if (msg.type === "cards_played") {

			if (msg.declared_rank !== null) {
				setDeclaredRank(msg.declared_rank);
			}
			setIsMyTurn(Boolean(msg.player_id === msg.your_info.id));

			// Generate final positions for each card BEFORE animating
			const scatterRange = Math.min(Math.min(width * 0.08, 60), Math.min(height * 0.08, 50))  // Horizontal scatter based on width

			const newCards = Array(msg.card_count)
				.fill(0)
				.map((_, i) => ({
					id: Math.random(), rotation: Math.random() * 60 - 30, // -30 to +30 degrees
					offsetX: Math.random() * scatterRange * 2 - scatterRange,  // -50 to +50 px
					offsetY: Math.random() * scatterRange * 2 - scatterRange,
					startRotation: -(5 + (i * 5))  // Starting rotation from hand
				}));

			// Animate cards moving to pile
			soundManager.play('cardPlay');
			const {x, y} = playerPositionsRef.current[msg.current_player];
			setAnimatingCards({
				playerId: msg.current_player, cardCount: msg.card_count, declaredRank: msg.declared_rank, x, y, cards: newCards,
				frozenCenter: {...tableCenter}
			});

			// Add status message
			const rankText = msg.declared_rank === "A" ? "Ace" : msg.declared_rank === "K" ? "King" : msg.declared_rank === "Q" ? "Queen" : msg.declared_rank === "J" ? "Jack" : msg.declared_rank;

			const countText = msg.card_count === 1 ? "One" : msg.card_count === 2 ? "Two" : "Three";
			addStatusMessage(msg.current_player, `${countText} ${rankText}${msg.card_count > 1 ? 's' : ''}!`, true, false, msg.declared_rank);

			if (msg.your_info.id !== (msg.current_player + 1) % numPlayers) {
				await new Promise(r => setTimeout(r, 1000)); // Wait for animation
			} else {
				await new Promise(r => setTimeout(r, 650));
			}
			setAnimatingCards(null);

			// Add cards to pile with the SAME positions
			setPileCards(prev => [...prev, ...newCards]);
			// Track how many were just played so we can highlight them when it's time to call bluff
			setLastPlayedCount(msg.card_count);

			// Wait for pile animation
			if (msg.your_info.id !== (msg.current_player + 1) % numPlayers) {
				await new Promise(r => setTimeout(r, 500));
			}

		} else if (msg.type === "bluff_called") {

			// Add a play announcement unless player is self
			if (msg.your_info.id !== msg.current_player) {
				addStatusMessage(msg.current_player, 'Call!', true);
				await new Promise(r => setTimeout(r, 2500));
			}
			setStatusMessages(prev => prev.filter(m => !m.is_play_announcement));

			setIsMyTurn(Boolean(msg.current_player === msg.your_info.id && msg.was_lying));

			// Show revealed cards
			if (msg.was_lying) {
				soundManager.play('bluffFail');
			} else {
				soundManager.play('bluffSuccess');
			}
			setRevealedCards({
				cards: msg.actual_cards,
				wasLying: msg.was_lying,
				declaredRank: msg.declared_rank,
				caller: msg.caller,
				accused: msg.accused,
				caller_name: msg.caller_name,
				accused_name: msg.accused_name
			});

			// Clear after showing cards
			await new Promise(r => setTimeout(r, 3000)); // wait before clearing

			// Start pile pickup animation
			const pickupPlayerId = msg.was_lying ? msg.accused : msg.caller;
			const {x: targetX, y: targetY} = playerPositionsRef.current[pickupPlayerId];
			if (pileCards.length > 0) {
				soundManager.play('pick_up');
				setPilePickupAnimation({
					playerId: pickupPlayerId, targetX, targetY, cards: [...pileCards] // Copy current pile cards
				});

				setPileCards([]);

				// Wait for pickup animation
				await new Promise(r => setTimeout(r, 1000));
				setPilePickupAnimation(null);
			}

			setPlayAnnouncements([]);
			setRevealedCards(null);
			setLastPlayedCount(0);

			// Cards have been discarded: set a message
		} else if (msg.type === "discard") {

			// Parse: "Player 2 discards 7, K, A."
			const match = msg.result.match(/Player (\d+) discards (.+)\./);
			if (match) {
				const playerId = parseInt(match[1]);
				const ranksStr = match[2]; // "7, K, A"
				const ranks = ranksStr.split(', '); // ["7", "K", "A"]

				// Show animation
				soundManager.play('discard');

				// Add to status messages instead of separate discardAnimation
				const message = playerId === msg.your_info.id ? `You discard ${ranksStr}s` : `Discarding ${ranksStr}s`;
				addStatusMessage(playerId, message);

				// Add all ranks to discard list
				setDiscards(prev => [...prev, ...ranks]);

				// Wait for animation
				await new Promise(r => setTimeout(r, 1500));
				setDiscardAnimation(null);
			}

			// Opinion status sent
		} else if (msg.type === "bot_message") {

			addStatusMessage(msg.sender_id, msg.message);

		} else if (msg.type === "catch_up") {

			const expectedPileSize = msg.pile_plays.reduce((sum, p) => sum + p.card_count, 0);


			const lastPlay = msg.pile_plays[msg.pile_plays.length - 1];
			const rankMismatch = lastPlay && lastPlay.declared_rank !== declaredRank;
			const sizeMismatch = pileCards.length !== expectedPileSize;

			if (sizeMismatch || rankMismatch) {
				const scatterRange = Math.min(Math.min(width * 0.08, 60), Math.min(height * 0.08, 50));
				const rebuiltPile = [];
				const newAnnouncements = [];
				for (const play of msg.pile_plays) {
					for (let i = 0; i < play.card_count; i++) {
						rebuiltPile.push({
							id: Math.random(),
							rotation: Math.random() * 60 - 30,
							offsetX: Math.random() * scatterRange * 2 - scatterRange,
							offsetY: Math.random() * scatterRange * 2 - scatterRange,
							startRotation: 0,
						});
					}
					const countText = play.card_count === 1 ? 'One' : play.card_count === 2 ? 'Two' : 'Three';
					const rankText = play.declared_rank === "A" ? "Ace" : play.declared_rank === "K" ? "King" : play.declared_rank === "Q" ? "Queen" : play.declared_rank === "J" ? "Jack" : play.declared_rank;
					newAnnouncements.push({
						id: Math.random(),
						playerId: play.player_id,
						message: `${countText} ${rankText}${play.card_count > 1 ? 's' : ''}!`,
					});
				}
				setPileCards(rebuiltPile);
				setPlayAnnouncements(newAnnouncements);
				if (rebuiltPile.length > 0) {
					setLastPlayedCount(msg.pile_plays.at(-1).card_count);
				}
			}

			// Game is over
		} else if (msg.type === "round_over") {

			setWinner(msg.winner);
			setGameOver(true);
			setPileCards([]);
			setState(prevState => ({
				...prevState, pile_size: 0
			}));
			setIsMyTurn(false);

			soundManager.play('win');
			// 🎉 Trigger confetti burst
			confetti({
				particleCount: 200, spread: 100, origin: {y: 0.6},
			});
		}

		// Abort if a reconnect cleared the queue while we were suspended in an await.
		// Without this guard, a stale run would call removeProcessed() on the new queue
		// and silently drop the first message (typically the post-reconnect state update).
		if (queueGenerationRef.current !== generation) {
			processingRef.current = false;
			return;
		}

		// remove the processed action
		removeProcessed(); // Remove after processing
		processingRef.current = false;

	};

	useEffect(() => {
		if (actionQueue.length > 0 && !processingRef.current) {
			processActionQueue();
		}
	}, [actionQueue, animatingCards, speakingPlayers, dealingFromCenter, isDealingCards]);

	// Checks whether the rank needs to be declared; if not, the text box disappears.
	// Also validates the rank, so that only valid ranks are sent to the backend.
	const play = useCallback(() => {

		setIsNewRound(declaredRank === null || declaredRank === "");

		if (!isMyTurn || selectedCards.length === 0 || selectedCards.length > 3) {
			return;
		}

		// Only require declared rank for new rounds
		if (isNewRound && !declaredRank) {
			return;
		}

		// Check rank before sending
		const normalizedRank = declaredRank.toUpperCase();
		if (!VALID_RANKS.includes(normalizedRank)) {
			setRankError(true);          // trigger UI feedback
			setTimeout(() => setRankError(false), 500); // reset after wiggle
			return;
		}

		setTimeoutRemaining(null);

		// Broadcast the play to the backend
		activeSocket?.send(JSON.stringify({
			type: "cards_played",
			declared_rank: declaredRank,
			cards: selectedCards,
			current_player: state.your_info.id,
			your_info: state.your_info,
			player_id: state.your_info.id,
			card_count: selectedCards.length
		}));

		// Optimistically update your hand immediately
		setState(prevState => ({
			...prevState, your_info: {
				...prevState.your_info, hand: prevState.your_info.hand.filter(card => !selectedCards.includes(card))
			}
		}));

		setSelectedCards([]);
		setHasActed(true);
		setShowRankInput(false);
	}, [selectedCards, declaredRank, activeSocket]);

	// Allow using the Enter key to play, without having to click on the button all the time
	// Guard: don't fire if focus is on a text input (e.g. the message box or rank input)
	useEffect(() => {
		const handleKeyPress = (e) => {
			if (e.key === 'Enter') {
				const tag = document.activeElement?.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA') return;
				e.preventDefault();
				play();
			}
		};

		window.addEventListener('keydown', handleKeyPress);
		return () => window.removeEventListener('keydown', handleKeyPress);
	}, [play]);

	useEffect(() => {
		if (!state) return;

		const calculatedIsNewRound = !declaredRank; // Calculate locally because we need to use the updated value here
		setIsNewRound(!declaredRank); // "" or null both mean new round
		if (isMyTurn && calculatedIsNewRound) {
			setShowRankInput(true);
		} else {
			setShowRankInput(false);
		}
	}, [state]);

	useEffect(() => {
		if (!state) return;
		if (state.players && state.your_info.id !== undefined) {
			const newOpponents = state.players
				.filter((player) => player.your_info.id !== state.your_info.id)
				.map((player) => ({
					id: player.your_info.id,
					name: player.your_info.name,
					avatar: player.your_info.avatar,
					cardCount: player.your_info.cardCount,
					type: player.your_info.type,
					connected: player.your_info.connected
				}));

			setOpponents(newOpponents);
		}
	}, [state?.players, state?.your_info.id]);

	// Play sound when Call Bluff! button pops up
	useEffect(() => {
		if (isMyTurn && state?.pile_size > 0 && state?.current_rank && !hasActed) {
			soundManager.play('callBluff');
		}
	}, [isMyTurn, state?.pile_size, state?.current_rank, hasActed]);

	// Notify backend the moment the player can see their turn, so the idle timer starts from now
	useEffect(() => {
		if (isMyTurn) {
			activeSocketRef.current?.send(JSON.stringify({type: 'turn_acknowledged'}));
		}
	}, [isMyTurn]);

	// Floating message bubbles
	useEffect(() => {
		statusMessages.forEach(msg => {
			if (!msg.is_connection_timer) {  // Don't auto-animate connection timers
				const element = document.getElementById(`status-${msg.id}`);
				if (element && !element.dataset.animated) {
					element.dataset.animated = 'true';

					// Remove after animation, or move to constant play announcements array
					const duration = msg.is_play_announcement ? 4000 : 3000;
					setTimeout(() => {
						setStatusMessages(prev => prev.filter(m => m.id !== msg.id));
						if (msg.is_play_announcement && msg.message !== 'Call!' && msg?.rank === declaredRank) {
							setPlayAnnouncements(prev => [...prev, {...msg}]);
						}
					}, duration);
				}
			}
		});
	}, [statusMessages]);

	const toggleCard = (card) => {
		setSelectedCards((sel) => {
			const newSelection = sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card];
			// Limit to 3 cards
			return newSelection.length <= 3 ? newSelection : sel;
		});
	};

	const callBluff = () => {
		setTimeoutRemaining(null);
		activeSocket?.send(JSON.stringify({type: "bluff_called"}));
		setHasActed(true);
	};

	const addStatusMessage = (playerId, message, is_play_announcement = false, is_connection_timer = false,
														rank = null) => {

		const playerElement = document.getElementById(`player-${playerId}`);

		// Replace any display names that do not match the actual player's name to avoid revealing
		// experimental conditions. Make this independent of capitalisation since players will be typing fast.
		if (state.your_info.name !== state.your_info.true_name) {
			message = message.replace(new RegExp(state.your_info.name, 'gi'), state.your_info.true_name);
		}

		if (playerElement) {

			// Add player to speaking set
			setSpeakingPlayers(prev => new Set(prev).add(playerId));

			// Not using playerPositions here because need fixed absolute positions at top of bounding box
			const rect = playerElement.getBoundingClientRect();
			const position = {
				x: rect.left + rect.width / 2, // Center horizontally
				y: playerId === state.your_info.id ? 1.02 * rect.top : 0.99 * rect.top
			};

			if (is_connection_timer) {
				// For connection timers, update existing message or create new one
				setStatusMessages(prev => {
					const existing = prev.find(m => m.playerId === playerId && m.is_connection_timer);
					if (existing) {
						// Update the existing timer message
						return prev.map(m => m.id === existing.id ? {...m, message} : m);
					} else {
						// Create new timer message
						return [...prev, {
							id: `timer-${playerId}`, // Stable ID for timers
							playerId, message, position, is_play_announcement: false, is_connection_timer: true, rank: null
						}];
					}
				});
			} else {
				const newMessageId = Math.random();
				setStatusMessages(prev => {
					// Push existing messages for this player upward
					const updated = prev.map(m =>
						!m.is_connection_timer && m.playerId === playerId
							? { ...m, position: { ...m.position, y: m.position.y - 40 } }
							: m
					);
					return [...updated, {
						id: newMessageId, playerId, message, position,
						is_play_announcement, is_connection_timer: false, rank: rank
					}];
				});

				// Remove after animation
				const duration = is_play_announcement ? 6000 : 3000;
				setTimeout(() => {
					setStatusMessages(prev => prev.filter(msg => msg.id !== newMessageId));
					setSpeakingPlayers(prev => {
						const newSet = new Set(prev);
						newSet.delete(playerId);
						return newSet;
					});
				}, duration);
			}
		}
	};
	// Removes the connection timer message from a player
	const removeConnectionTimer = (playerId) => {
		setStatusMessages(prev => prev.filter(msg => !(msg.playerId === playerId && msg.is_connection_timer)));
		setSpeakingPlayers(prev => {
			const newSet = new Set(prev);
			newSet.delete(playerId);
			return newSet;
		});
	};

	const removeAllConnectionTimers = () => {
		setStatusMessages(prev => {
			const timers = prev.filter(msg => msg.is_connection_timer);

			// Remove those players from speaking set
			setSpeakingPlayers(speakingPrev => {
				const newSet = new Set(speakingPrev);
				timers.forEach(msg => {
					newSet.delete(msg.playerId);
				});
				return newSet;
			});

			// Return filtered messages
			return prev.filter(msg => !msg.is_connection_timer);
		});
	};

	// Human message: sends the message input by default
	const sendMessage = useCallback((customMessage = null) => {
		const messageToSend = customMessage || messageInput.trim();

		if (messageToSend && activeSocket) {
			activeSocket.send(JSON.stringify({
				type: "human_message", message: messageToSend, sender_id: state.your_info.id
			}));

			// addStatusMessage(state.your_info.id, messageToSend);

			if (!customMessage) {
				setMessageInput(""); // Only clear if it was from the input
			}
		}
	}, [messageInput, activeSocket, state?.your_info.id]);

	// Human click on opponent
	const handlePlayerClick = (opponent) => {
		if (!activeSocket || gameOver) return;

		const cardText = opponent.cardCount === 1 ? "1 card" : `${opponent.cardCount} cards`;
		const message = `Woah, ${opponent.name} only has ${cardText} left!`;

		// Send to backend to broadcast
		activeSocket.send(JSON.stringify({
			type: "human_message", message: message, sender_id: state.your_info.id
		}));
	};

	return (

		<div className={`${containerWidth ? 'h-full' : 'min-h-screen'} text-white flex flex-col p-6`}>

			{/* Game logo */}
			<div className="fixed inset-0 flex items-center justify-center pointer-events-none">
				<Logo className="opacity-20"
							style={{width: "min(20rem, 50vw)", height: "auto"}}
							animated={false}
				/>
			</div>

			{/* Game menu */}
			<GameMenu
				onQuit={() => {
					if (activeSocket) {
						activeSocket.send(JSON.stringify({type: "quit", player_id: state.your_info.id}));
					}
					onExitGame();
				}}
				highlightMenu={highlightMenu}
				experimentalMode={experimentalMode}
			/>

			{/* Game is over */}
			<GameOverOverlay
				gameOver={gameOver}
				winner={winner} f
				state={state}
				ws={activeSocket}
				setGameOver={setGameOver}
				setWinner={setWinner}
				setSelectedCards={setSelectedCards}
				setDeclaredRank={setDeclaredRank}
				setHasActed={setHasActed}
				setPileCards={setPileCards}
				setActionQueue={setActionQueue}
				setIsNewRound={setIsNewRound}
				setDiscards={setDiscards}
				setPlayAnnouncements={setPlayAnnouncements}
				onQuit={() => {
					if (activeSocket) {
						activeSocket.send(JSON.stringify({type: "quit", player_id: state.your_info.id}));
					}
					onExitGame();
				}}
				countdown={countdown}
				confirmedCount={confirmedCount}
				totalHumans={totalHumans}
				experimentalMode={experimentalMode}
				experimentOver={experimentOver}
				hasClickedNextRound={hasClickedNextRound}
				setHasClickedNextRound={setHasClickedNextRound}
				onFinish={onFinish}
			/>

			{/* Status Message bubbles floating up from each player */}
			<StatusMessage
				statusMessages={statusMessages}
				tutorialScale={tutorialScale}
			/>

			{/* Section containing players and cards*/}
			<div className="flex-1 flex items-center justify-center relative">

				{/* Opponents arranged in semi-circle around pile */}
				<OpponentIcons
					opponents={opponents}
					playAnnouncements={playAnnouncements}
					playerPositions={playerPositionsRef.current}
					handlePlayerClick={handlePlayerClick}
					state={state}
					getPlayerColor={getPlayerColor}
					experimentalMode={experimentalMode}
				/>

				{/* Animation of cards being dealt */}
				<CardDeal
					dealingCards={centerDealCards}
					playerPositions={playerPositionsRef.current}
					tableCenter={tableCenter}
				/>

				{/* Connection dropped overlay */}
				{!disableReconnect && <ConnectionDroppedOverlay connectionDropped={connectionDropped} isReconnecting={isReconnecting} showReconnected={showReconnected} />}
				<TimeoutWarningOverlay timeoutRemaining={timeoutRemaining} pileSize={pileCards.length} />

				{/* Banner when game begins */}
				<GameStartOverlay
					showLetsGo = {showLetsGo}
				/>

				{/* Card pile in the center of the table */}
				<CenterPile
					isMyTurn={isMyTurn}
					hasActed={hasActed}
					pileCards={pileCards}
					lastPlayedCount={lastPlayedCount}
					tableCenter={tableCenter}
				/>

				{/* Overlay of revealed plays */}
				<CardRevealOverlay
					revealedCards={revealedCards}
					parseCard={parseCard}
					state={state}
				/>

				{/* Player hand with cards and play controls */}
				<PlayerHand
					isMyTurn={isMyTurn}
					hasActed={hasActed}
					isNewRound={isNewRound}
					showRankInput={showRankInput}
					rankError={rankError}
					selectedCards={selectedCards}
					state={state}
					sendMessage={sendMessage}
					play={play}
					setDeclaredRank={setDeclaredRank}
					messageInput={messageInput}
					allowedMessages={predefinedMessages}
					declaredRank={declaredRank}
					parseCard={parseCard}
					toggleCard={toggleCard}
					setMessageInput={setMessageInput}
					playerPositions={playerPositionsRef.current}
					yourId={selfId}
					pileCards={pileCards}
					callBluff={callBluff}
					isDealingCards={isDealingCards}
				/>

				{/* Animation of cards being played flying out */}
				<CardFlyAnimation animatingCards={animatingCards} tableCenter={tableCenter}/>

				{/* Animation of the pile being picked up after a call */}
				<PilePickUpAnimation pilePickupAnimation={pilePickupAnimation}/>

				{/* Animation of cards being discarded */}
				<DiscardAnimation discards={discards}
													width={width}
													height={height}
													playerPositions={playerPositionsRef.current}
													selfId={state.your_info.id}
				/>

			</div>

		</div>);
}
