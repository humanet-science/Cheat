"""
Comprehensive tests for the WebSocket reconnection system.

Coverage:
  - reconnection_slots lifecycle (creation on disconnect, removal on reconnect/expiry)
  - successful reconnect: confirmed message, player state, mapping restoration
  - failed reconnect: unknown token, missing token, expired token, duplicate token
  - grace period: game stays alive during grace, single-player ends after, bot replacement in multiplayer
  - state integrity: no leaks, two independent slots in multiplayer
  - ping/pong: server sends pings, pong prevents timeout, no-pong triggers disconnect + grace
"""

import asyncio
import os
import sys

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), ".."), "..")),
)

import pytest

import cheat.server as server
from tests.utils import MockWebSocket

# ---------------------------------------------------------------------------
# Test utilities
# ---------------------------------------------------------------------------


class MockWebSocketControllablePong(MockWebSocket):
    """MockWebSocket that can auto-queue a pong whenever the server sends a ping.

    Start with auto_pong=True to keep a connection alive during setup, then set
    auto_pong=False to simulate a client that stops responding to pings.
    """

    def __init__(self):
        super().__init__()
        self.auto_pong = True

    async def send_json(self, message):
        await super().send_json(message)
        if self.auto_pong and message.get("type") == "ping":
            self.queue_message({"type": "pong"})


async def _join_single_player_game(ws, name="Player"):
    """Queue a player_join for a 4-player single game and wait for it to start.

    Returns the websocket_endpoint handler task.
    """
    ws.queue_message(
        {
            "type": "player_join",
            "name": name,
            "avatar": "avatar1",
            "num_players": 4,
            "game_mode": "single",
        }
    )
    task = asyncio.create_task(server.websocket_endpoint(ws))
    # Let the join message be processed
    await asyncio.sleep(0.5)
    # Wait for game_manager to start the game (checks every 1 s)
    elapsed = 0.0
    while elapsed < 3.5 and len(server.active_games) == 0:
        await asyncio.sleep(0.2)
        elapsed += 0.2
    return task


async def _do_reconnect(token):
    """Open a fresh websocket and send a reconnect message for the given token.

    Returns (new_ws, handler_task). The caller is responsible for cleanup.
    """
    ws = MockWebSocket()
    ws.queue_message({"type": "reconnect", "token": token})
    task = asyncio.create_task(server.websocket_endpoint(ws))
    await asyncio.sleep(0.4)
    return ws, task


async def _cancel(task):
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


async def _end_games():
    for gid in list(server.active_games.keys()):
        server.active_games[gid].game_over = True
    await asyncio.sleep(0.3)


# ---------------------------------------------------------------------------
# reconnection_slots lifecycle
# ---------------------------------------------------------------------------


class TestReconnectionSlotLifecycle:
    """Verify the reconnection_slots dict is correctly created and cleaned up."""

    @pytest.mark.asyncio
    async def test_slot_created_on_in_game_disconnect(
        self, clean_server_state, running_game_manager
    ):
        """Disconnecting from an active game populates reconnection_slots."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws = MockWebSocket()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            assert len(server.active_games) == 1

            token = ws.get_session_token()
            assert token not in server.reconnection_slots

            ws.close()
            await asyncio.sleep(0.4)

            assert token in server.reconnection_slots
            slot = server.reconnection_slots[token]
            assert slot["player"].name == "Player"
            assert slot["game_id"] == list(server.active_games.keys())[0]
            assert not slot["task"].done()
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_slot_not_created_when_disconnecting_from_queue(
        self, clean_server_state, running_game_manager
    ):
        """Disconnecting before a game starts does NOT create a reconnection slot."""
        ws = MockWebSocket()
        ws.queue_message(
            {
                "type": "player_join",
                "name": "Queuer",
                "avatar": "a",
                "num_players": 4,
                "game_mode": "multiplayer",  # won't start without 3 humans
            }
        )
        handler = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.4)
        assert len(server.active_games) == 0

        ws.close()
        await asyncio.sleep(0.4)

        assert len(server.reconnection_slots) == 0
        await _cancel(handler)

    @pytest.mark.asyncio
    async def test_slot_removed_on_successful_reconnect(
        self, clean_server_state, running_game_manager
    ):
        """Slot is popped (not just read) when the player reconnects in time."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)
            assert token in server.reconnection_slots

            ws2, handler2 = await _do_reconnect(token)
            assert token not in server.reconnection_slots
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_slot_removed_when_grace_period_expires(
        self, clean_server_state, running_game_manager
    ):
        """Slot is removed by _delayed_replace after grace period elapses."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 0.5
        ws = MockWebSocket()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            token = ws.get_session_token()

            ws.close()
            await asyncio.sleep(0.4)
            assert token in server.reconnection_slots

            await asyncio.sleep(0.8)  # grace (0.5 s) + buffer
            assert token not in server.reconnection_slots
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_grace_task_cancelled_on_reconnect(
        self, clean_server_state, running_game_manager
    ):
        """The _delayed_replace asyncio task is cancelled when the player reconnects."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            grace_task = server.reconnection_slots[token]["task"]
            assert not grace_task.done()

            ws2, handler2 = await _do_reconnect(token)
            await asyncio.sleep(0.1)

            assert grace_task.done()  # cancelled or completed
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()


# ---------------------------------------------------------------------------
# Successful reconnect
# ---------------------------------------------------------------------------


class TestReconnectSuccess:
    """Verify correct server behaviour on a valid reconnect."""

    @pytest.mark.asyncio
    async def test_reconnect_confirmed_sent_to_new_socket(
        self, clean_server_state, running_game_manager
    ):
        """New websocket receives exactly one reconnect_confirmed message."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            ws2, handler2 = await _do_reconnect(token)

            msgs = ws2.get_sent_messages_of_type("reconnect_confirmed")
            assert len(msgs) == 1
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_reconnect_confirmed_contains_player_and_game_fields(
        self, clean_server_state, running_game_manager
    ):
        """reconnect_confirmed carries both player info and game state."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            ws2, handler2 = await _do_reconnect(token)

            msg = ws2.get_sent_messages_of_type("reconnect_confirmed")[0]
            # player info is nested under your_info
            assert "your_info" in msg
            assert "name" in msg["your_info"]
            # game state fields
            assert "game_id" in msg
            assert "players" in msg
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_player_connected_flag_restored(
        self, clean_server_state, running_game_manager
    ):
        """player.connected is True again after successful reconnect."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            game = list(server.active_games.values())[0]
            human = next(p for p in game.players if p.type == "human")
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)
            assert human.connected is False

            ws2, handler2 = await _do_reconnect(token)
            assert human.connected is True
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_player_ws_updated_to_new_socket(
        self, clean_server_state, running_game_manager
    ):
        """player.ws points to the new websocket after reconnect."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            game = list(server.active_games.values())[0]
            human = next(p for p in game.players if p.type == "human")
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            ws2, handler2 = await _do_reconnect(token)
            assert human.ws is ws2
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_player_to_game_restored_after_reconnect(
        self, clean_server_state, running_game_manager
    ):
        """player_to_game is absent on disconnect and restored on reconnect."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            game_id = list(server.active_games.keys())[0]
            token = ws1.get_session_token()
            assert token in server.player_to_game

            ws1.close()
            await asyncio.sleep(0.4)
            assert token not in server.player_to_game

            ws2, handler2 = await _do_reconnect(token)
            assert token in server.player_to_game
            assert server.player_to_game[token] == game_id
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_session_token_preserved_after_reconnect(
        self, clean_server_state, running_game_manager
    ):
        """player.session_token is kept as the original token after reconnect."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            game = list(server.active_games.values())[0]
            human = next(p for p in game.players if p.type == "human")
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            ws2, handler2 = await _do_reconnect(token)
            assert human.session_token == token
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()


# ---------------------------------------------------------------------------
# Failed reconnect
# ---------------------------------------------------------------------------


class TestReconnectFailure:
    """Verify reconnect_failed is sent in all rejection scenarios."""

    @pytest.mark.asyncio
    async def test_unknown_token_returns_reconnect_failed(
        self, clean_server_state, running_game_manager
    ):
        """Token that doesn't match any slot → reconnect_failed, connection closes."""
        ws = MockWebSocket()
        ws.queue_message({"type": "reconnect", "token": "no-such-token-xyz"})
        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.4)

        assert len(ws.get_sent_messages_of_type("reconnect_failed")) == 1
        await _cancel(task)

    @pytest.mark.asyncio
    async def test_null_token_returns_reconnect_failed(
        self, clean_server_state, running_game_manager
    ):
        """Explicit null token → reconnect_failed."""
        ws = MockWebSocket()
        ws.queue_message({"type": "reconnect", "token": None})
        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.4)

        assert len(ws.get_sent_messages_of_type("reconnect_failed")) == 1
        await _cancel(task)

    @pytest.mark.asyncio
    async def test_missing_token_field_returns_reconnect_failed(
        self, clean_server_state, running_game_manager
    ):
        """No token key at all → reconnect_failed."""
        ws = MockWebSocket()
        ws.queue_message({"type": "reconnect"})
        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.4)

        assert len(ws.get_sent_messages_of_type("reconnect_failed")) == 1
        await _cancel(task)

    @pytest.mark.asyncio
    async def test_expired_token_returns_reconnect_failed(
        self, clean_server_state, running_game_manager
    ):
        """Token that expired after grace period → reconnect_failed."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 0.5
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)
            assert token in server.reconnection_slots

            # Wait for grace to expire and slot to be removed
            await asyncio.sleep(0.8)
            assert token not in server.reconnection_slots

            ws2, handler2 = await _do_reconnect(token)
            assert len(ws2.get_sent_messages_of_type("reconnect_failed")) == 1
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_second_reconnect_with_same_token_fails(
        self, clean_server_state, running_game_manager
    ):
        """Slot is consumed on first reconnect — second attempt with same token fails."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = handler3 = ws2 = ws3 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            ws2, handler2 = await _do_reconnect(token)
            assert len(ws2.get_sent_messages_of_type("reconnect_confirmed")) == 1

            ws3, handler3 = await _do_reconnect(token)
            assert len(ws3.get_sent_messages_of_type("reconnect_failed")) == 1
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            for w in (ws2, ws3):
                if w:
                    w.close()
            for t in (handler1, handler2, handler3):
                await _cancel(t)
            await _end_games()


# ---------------------------------------------------------------------------
# Grace period behaviour
# ---------------------------------------------------------------------------


class TestGracePeriod:
    """Verify game state during and after the reconnection grace period."""

    @pytest.mark.asyncio
    async def test_game_stays_active_during_grace_period(
        self, clean_server_state, running_game_manager
    ):
        """Game is not removed from active_games while grace period is running."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 5.0
        ws = MockWebSocket()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            game_id = list(server.active_games.keys())[0]

            ws.close()
            await asyncio.sleep(0.4)

            assert game_id in server.active_games
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_player_to_game_absent_during_grace_period(
        self, clean_server_state, running_game_manager
    ):
        """player_to_game entry is removed immediately on disconnect (not after grace)."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 5.0
        ws = MockWebSocket()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            token = ws.get_session_token()
            assert token in server.player_to_game

            ws.close()
            await asyncio.sleep(0.4)

            # Removed immediately — not waiting for grace to end
            assert token not in server.player_to_game
            # But slot is still alive
            assert token in server.reconnection_slots
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_single_player_game_ends_after_grace_expires(
        self, clean_server_state, running_game_manager
    ):
        """Single-player game ends (game_over=True) when grace expires and no reconnect."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 0.5
        ws = MockWebSocket()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            game_id = list(server.active_games.keys())[0]
            game = server.active_games[game_id]

            ws.close()
            await asyncio.sleep(0.4)
            assert game_id in server.active_games  # still alive during grace

            # Poll: grace (0.5 s) + run_game exits its loop + finally cleanup.
            # The game is mid-round when game_over is set so we poll generously.
            elapsed = 0.0
            while elapsed < 6.0 and game_id in server.active_games:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            assert game.game_over is True
            assert game_id not in server.active_games
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_multiplayer_disconnected_player_replaced_with_bot(
        self, clean_server_state, running_game_manager
    ):
        """In multiplayer, a player whose grace expires while others remain is replaced by a bot."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 0.5
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        ws3 = MockWebSocket()
        h1 = h2 = h3 = None
        try:
            for ws, name in [(ws1, "P1"), (ws2, "P2"), (ws3, "P3")]:
                ws.queue_message(
                    {
                        "type": "player_join",
                        "name": name,
                        "avatar": "a",
                        "num_players": 4,
                        "game_mode": "multiplayer",
                    }
                )
            h1 = asyncio.create_task(server.websocket_endpoint(ws1))
            h2 = asyncio.create_task(server.websocket_endpoint(ws2))
            h3 = asyncio.create_task(server.websocket_endpoint(ws3))
            await asyncio.sleep(0.5)

            elapsed = 0.0
            while elapsed < 3.5 and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            assert len(server.active_games) == 1
            game = list(server.active_games.values())[0]
            assert len([p for p in game.players if p.type == "human"]) == 3

            # P1 disconnects; P2 and P3 remain
            ws1.close()
            await asyncio.sleep(1.5)  # grace (0.5 s) + bot replacement + buffer

            # Game still active
            assert game in server.active_games.values()
            # P1 replaced by a bot; remaining humans = 2
            assert len([p for p in game.players if p.type == "human"]) == 2
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            ws2.close()
            ws3.close()
            for t in (h1, h2, h3):
                await _cancel(t)
            await _end_games()

    @pytest.mark.asyncio
    async def test_reconnect_before_grace_prevents_bot_replacement(
        self, clean_server_state, running_game_manager
    ):
        """Player that reconnects before grace expires is NOT replaced by a bot."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 2.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            game = list(server.active_games.values())[0]
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            # Reconnect well before 2-second grace
            ws2, handler2 = await _do_reconnect(token)

            # Wait longer than the original grace period would have taken
            await asyncio.sleep(2.5)

            # Player is still human (not replaced)
            human_players = [p for p in game.players if p.type == "human"]
            assert len(human_players) == 1
            assert human_players[0].name == "Player"
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()


# ---------------------------------------------------------------------------
# Ping / pong health-check
# ---------------------------------------------------------------------------


class TestPingPong:
    """Verify the server ping loop sends pings, handles pongs, and disconnects on timeout."""

    @pytest.mark.asyncio
    async def test_server_sends_ping_messages(
        self, clean_server_state, running_game_manager
    ):
        """Server emits ping messages at the configured interval."""
        original_interval = server.PING_INTERVAL_SECONDS
        original_timeout = server.PING_TIMEOUT_SECONDS
        # PING_TIMEOUT must be > MockWebSocket's 0.5 s idle ceiling so that pongs
        # queued during send_json are always processed before the timeout fires.
        server.PING_INTERVAL_SECONDS = 0.3
        server.PING_TIMEOUT_SECONDS = 1.0
        ws = MockWebSocketControllablePong()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            await asyncio.sleep(1.0)  # > 3× interval

            assert len(ws.get_sent_messages_of_type("ping")) >= 2
        finally:
            server.PING_INTERVAL_SECONDS = original_interval
            server.PING_TIMEOUT_SECONDS = original_timeout
            ws.close()
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_pong_response_keeps_connection_alive(
        self, clean_server_state, running_game_manager
    ):
        """Player that responds with pong is not disconnected by ping timeout."""
        original_interval = server.PING_INTERVAL_SECONDS
        original_timeout = server.PING_TIMEOUT_SECONDS
        server.PING_INTERVAL_SECONDS = 0.3
        server.PING_TIMEOUT_SECONDS = 1.0  # > MockWebSocket's 0.5 s idle cycle
        ws = MockWebSocketControllablePong()  # auto_pong=True
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            game = list(server.active_games.values())[0]
            human = next(p for p in game.players if p.type == "human")

            await asyncio.sleep(3.0)  # several full ping/pong cycles

            assert human.connected is True
            assert len(server.reconnection_slots) == 0
        finally:
            server.PING_INTERVAL_SECONDS = original_interval
            server.PING_TIMEOUT_SECONDS = original_timeout
            ws.close()
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_missing_pong_triggers_disconnect_and_grace_slot(
        self, clean_server_state, running_game_manager
    ):
        """No pong within timeout causes the server to close the connection and open a grace slot."""
        original_interval = server.PING_INTERVAL_SECONDS
        original_timeout = server.PING_TIMEOUT_SECONDS
        original_grace = server.RECONNECT_GRACE_SECONDS
        # Use safe values during setup so pongs are processed reliably.
        server.PING_INTERVAL_SECONDS = 0.3
        server.PING_TIMEOUT_SECONDS = 1.0
        server.RECONNECT_GRACE_SECONDS = 30.0

        ws = MockWebSocketControllablePong()
        handler = None
        token = None
        try:
            handler = await _join_single_player_game(ws)
            token = ws.get_session_token()
            game = list(server.active_games.values())[0]
            human = next(p for p in game.players if p.type == "human")

            # Stop responding to pings. The current ping loop iteration sleeps
            # for PING_INTERVAL_SECONDS, then times out after PING_TIMEOUT_SECONDS,
            # so we need to wait at most interval + timeout + buffer.
            ws.auto_pong = False
            await asyncio.sleep(2.5)  # 0.3 (interval) + 1.0 (timeout) + 1.2 (buffer)

            assert human.connected is False
            assert token in server.reconnection_slots
        finally:
            server.PING_INTERVAL_SECONDS = original_interval
            server.PING_TIMEOUT_SECONDS = original_timeout
            server.RECONNECT_GRACE_SECONDS = original_grace
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_ping_loop_fires_multiple_times(
        self, clean_server_state, running_game_manager
    ):
        """Multiple ping cycles run as long as the client keeps responding."""
        original_interval = server.PING_INTERVAL_SECONDS
        original_timeout = server.PING_TIMEOUT_SECONDS
        server.PING_INTERVAL_SECONDS = 0.3
        server.PING_TIMEOUT_SECONDS = 1.0
        ws = MockWebSocketControllablePong()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            await asyncio.sleep(2.0)

            # Expect at least 4 pings in 2 s at 0.3 s intervals
            pings = ws.get_sent_messages_of_type("ping")
            assert len(pings) >= 4
        finally:
            server.PING_INTERVAL_SECONDS = original_interval
            server.PING_TIMEOUT_SECONDS = original_timeout
            ws.close()
            await _cancel(handler)
            await _end_games()


# ---------------------------------------------------------------------------
# State integrity
# ---------------------------------------------------------------------------


class TestStateIntegrity:
    """Verify no state leaks across reconnect/grace scenarios."""

    @pytest.mark.asyncio
    async def test_no_slot_leak_after_successful_reconnect(
        self, clean_server_state, running_game_manager
    ):
        """reconnection_slots is empty after a complete disconnect-then-reconnect cycle."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)
            assert len(server.reconnection_slots) == 1

            ws2, handler2 = await _do_reconnect(token)
            assert len(server.reconnection_slots) == 0
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()

    @pytest.mark.asyncio
    async def test_no_slot_leak_after_grace_expiry(
        self, clean_server_state, running_game_manager
    ):
        """reconnection_slots is empty after grace expires without a reconnect."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 0.5
        ws = MockWebSocket()
        handler = None
        try:
            handler = await _join_single_player_game(ws)
            ws.close()
            await asyncio.sleep(1.5)  # > grace + game cleanup

            assert len(server.reconnection_slots) == 0
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            await _cancel(handler)
            await _end_games()

    @pytest.mark.asyncio
    async def test_two_multiplayer_players_get_independent_slots(
        self, clean_server_state, running_game_manager
    ):
        """Two players disconnecting from the same game each get their own independent slot."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        ws3 = MockWebSocket()
        h1 = h2 = h3 = None
        try:
            for ws, name in [(ws1, "P1"), (ws2, "P2"), (ws3, "P3")]:
                ws.queue_message(
                    {
                        "type": "player_join",
                        "name": name,
                        "avatar": "a",
                        "num_players": 4,
                        "game_mode": "multiplayer",
                    }
                )
            h1 = asyncio.create_task(server.websocket_endpoint(ws1))
            h2 = asyncio.create_task(server.websocket_endpoint(ws2))
            h3 = asyncio.create_task(server.websocket_endpoint(ws3))
            await asyncio.sleep(0.5)

            elapsed = 0.0
            while elapsed < 3.5 and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            token1 = ws1.get_session_token()
            token2 = ws2.get_session_token()
            assert token1 != token2

            ws1.close()
            ws2.close()
            await asyncio.sleep(0.6)

            assert token1 in server.reconnection_slots
            assert token2 in server.reconnection_slots
            assert server.reconnection_slots[token1]["player"].name == "P1"
            assert server.reconnection_slots[token2]["player"].name == "P2"
            # Tasks are independent
            assert (
                server.reconnection_slots[token1]["task"]
                is not server.reconnection_slots[token2]["task"]
            )
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            ws3.close()
            for t in (h1, h2, h3):
                await _cancel(t)
            await _end_games()

    @pytest.mark.asyncio
    async def test_full_disconnect_reconnect_cycle_leaves_clean_state(
        self, clean_server_state, running_game_manager
    ):
        """After a full disconnect-reconnect-then-quit cycle, all dicts are empty."""
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 30.0
        ws1 = MockWebSocket()
        handler1 = handler2 = ws2 = None
        try:
            handler1 = await _join_single_player_game(ws1)
            token = ws1.get_session_token()

            ws1.close()
            await asyncio.sleep(0.4)

            ws2, handler2 = await _do_reconnect(token)

            # Player quits properly after reconnect
            ws2.queue_message({"type": "quit"})
            await asyncio.sleep(0.5)

            # Wait for game to be removed
            elapsed = 0.0
            while elapsed < 2.0 and len(server.active_games) > 0:
                await asyncio.sleep(0.1)
                elapsed += 0.1

            assert len(server.active_games) == 0
            assert len(server.player_to_game) == 0
            assert len(server.reconnection_slots) == 0
        finally:
            server.RECONNECT_GRACE_SECONDS = original_grace
            if ws2:
                ws2.close()
            await _cancel(handler1)
            await _cancel(handler2)
            await _end_games()
