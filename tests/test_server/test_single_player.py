"""
Tests for single-player game scenarios, including joining and disconnecting/quiting the game.
"""

import os

# Add the project root to Python path
import sys

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), ".."), "..")),
)

import asyncio

import pytest

import cheat.server as server
from tests.utils import MockWebSocket


class TestSinglePlayerJoinFlow:
    """Test the complete single-player join and game start flow."""

    @pytest.mark.asyncio
    async def test_player_joins_queue_via_websocket(
        self, clean_server_state, running_game_manager
    ):
        """Test player joining queue through WebSocket message."""

        ws = MockWebSocket()
        handler_task = None

        try:
            # Queue the join message
            ws.queue_message(
                {
                    "type": "player_join",
                    "name": "TestPlayer",
                    "avatar": "avatar1",
                    "num_players": 4,
                    "game_mode": "single",
                }
            )

            # Start the websocket handler in background
            handler_task = asyncio.create_task(server.websocket_endpoint(ws))

            # Wait for join message to be processed
            await asyncio.sleep(0.5)

            # Check that queue_joined message was sent
            queue_msgs = ws.get_sent_messages_of_type("queue_joined")
            assert len(queue_msgs) > 0
            assert queue_msgs[0]["num_connected"] >= 1

            # Wait for game_manager to process the queue (it checks every 1 second)
            # Poll for game creation instead of fixed sleep
            max_wait = (
                3.5  # Increased to ensure we catch at least 2 game_manager cycles
            )
            elapsed = 0.0
            check_interval = 0.2

            print(f"Waiting for game to start (max {max_wait}s)...")
            while elapsed < max_wait and len(server.active_games) == 0:
                await asyncio.sleep(check_interval)
                elapsed += check_interval
                if elapsed % 1.0 < check_interval:  # Log every second
                    print(
                        f"  {elapsed:.1f}s: active_games={len(server.active_games)}, "
                        f"queue_size={len(server.waiting_queues[4]['single'])}"
                    )

            # Check game was created
            assert len(server.active_games) >= 1

            # Verify the game has the right properties
            game = list(server.active_games.values())[0]
            assert game.num_players == 4
            assert game.game_mode == "single"

            # Verify player composition
            human_players = [p for p in game.players if p.type == "human"]
            assert len(human_players) == 1
            assert human_players[0].name == "TestPlayer"

        finally:
            # Cleanup: close websocket and cancel handler
            if handler_task:
                ws.close()
                handler_task.cancel()
                try:
                    await handler_task
                except asyncio.CancelledError:
                    pass

            # End any active games
            for game_id in list(server.active_games.keys()):
                server.active_games[game_id].game_over = True

            await asyncio.sleep(0.5)  # Let cleanup happen


class TestPlayerDisconnection:
    """Test handling of player disconnection during active game."""

    @pytest.mark.asyncio
    async def test_player_disconnects_during_single_player_game(
        self, clean_server_state, running_game_manager
    ):
        """Test that server properly cleans up when the only human player disconnects."""

        ws = MockWebSocket()
        handler_task = None

        try:
            # Step 1: Player joins queue
            ws.queue_message(
                {
                    "type": "player_join",
                    "name": "TestPlayer",
                    "avatar": "avatar1",
                    "num_players": 4,
                    "game_mode": "single",
                }
            )

            # Start the websocket handler - server handles the rest
            handler_task = asyncio.create_task(server.websocket_endpoint(ws))
            await asyncio.sleep(0.5)

            # Verify player is in queue
            assert len(server.waiting_queues[4]["single"]) == 1

            # Wait for game_manager to automatically start the game
            max_wait = 3.5
            elapsed = 0.0
            check_interval = 0.2

            print("Waiting for game_manager to start game...")
            while elapsed < max_wait and len(server.active_games) == 0:
                await asyncio.sleep(check_interval)
                elapsed += check_interval

            # Verify game was created by game_manager
            assert len(server.active_games) == 1

            game_id = list(server.active_games.keys())[0]
            game = server.active_games[game_id]

            # Verify player-to-game mapping exists
            assert id(ws) in server.player_to_game
            assert server.player_to_game[id(ws)] == game_id

            # Get the human player reference
            human_player = [p for p in game.players if p.type == "human"][0]
            assert human_player.connected == True
            assert human_player.name == "TestPlayer"

            # Step 3: Player disconnects (close websocket)
            # This simulates what happens when a user closes their browser
            ws.close()

            print(
                "Player WebSocket closed, waiting for server to detect and cleanup..."
            )

            # Step 4: Wait for server to automatically detect disconnect and cleanup
            # The websocket_endpoint should catch the disconnect and trigger cleanup
            max_cleanup_wait = 3.0
            elapsed = 0.0

            while elapsed < max_cleanup_wait and game_id in server.active_games:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Verify the server automatically cleaned everything up
            assert game_id not in server.active_games

            # Player-to-game mapping should be removed
            assert id(ws) not in server.player_to_game

            # No games should remain in waiting queues
            assert len(server.waiting_queues[4]["single"]) == 0

            # Player should be marked as disconnected
            assert human_player.connected == False

        finally:
            # Extra cleanup to ensure no state leaks
            if handler_task and not handler_task.done():
                handler_task.cancel()
                try:
                    await handler_task
                except asyncio.CancelledError:
                    pass

            # Force cleanup any remaining games
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True
            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_player_quits_explicitly_during_game(
        self, clean_server_state, running_game_manager
    ):
        """Test that server handles explicit quit message from player."""

        ws = MockWebSocket()
        handler_task = None

        try:
            # Step 1: Player joins queue
            ws.queue_message(
                {
                    "type": "player_join",
                    "name": "TestPlayer",
                    "avatar": "avatar1",
                    "num_players": 4,
                    "game_mode": "single",
                }
            )

            handler_task = asyncio.create_task(server.websocket_endpoint(ws))
            await asyncio.sleep(0.5)

            # Step 2: Wait for game_manager to start the game
            max_wait = 3.5
            elapsed = 0.0

            while elapsed < max_wait and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Verify game exists
            assert len(server.active_games) == 1
            game_id = list(server.active_games.keys())[0]

            # Step 3: Player sends quit message
            # This goes through the normal websocket message handling
            ws.queue_message({"type": "quit"})

            # Give time for server to process the quit message
            await asyncio.sleep(0.5)

            # Step 4: Verify server handled the quit automatically
            # Should receive quit_confirmed message
            quit_msgs = ws.get_sent_messages_of_type("quit_confirmed")
            assert len(quit_msgs) >= 1

            # Wait for full cleanup
            max_cleanup_wait = 2.0
            elapsed = 0.0

            while elapsed < max_cleanup_wait and game_id in server.active_games:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Verify full automatic cleanup
            assert game_id not in server.active_games
            assert id(ws) not in server.player_to_game

        finally:
            ws.close()
            if handler_task and not handler_task.done():
                handler_task.cancel()
                try:
                    await handler_task
                except asyncio.CancelledError:
                    pass

            # Force cleanup
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True
            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_no_state_leaks_after_multiple_disconnections(
        self, clean_server_state, running_game_manager
    ):
        """Test that multiple join-disconnect cycles don't leak state.

        This stress test verifies the server's cleanup robustness by running
        multiple cycles and ensuring no state accumulates.
        """

        for i in range(3):
            ws = MockWebSocket()
            handler_task = None

            try:
                print(f"\n--- Cycle {i + 1} ---")

                # Join queue
                ws.queue_message(
                    {
                        "type": "player_join",
                        "name": f"TestPlayer{i}",
                        "avatar": "avatar1",
                        "num_players": 4,
                        "game_mode": "single",
                    }
                )

                handler_task = asyncio.create_task(server.websocket_endpoint(ws))
                await asyncio.sleep(0.5)

                # Wait for game_manager to start game
                max_wait = 3.5
                elapsed = 0.0

                while elapsed < max_wait and len(server.active_games) == 0:
                    await asyncio.sleep(0.2)
                    elapsed += 0.2

                # Verify game started
                assert len(server.active_games) == 1
                game_id = list(server.active_games.keys())[0]

                # Disconnect and wait for automatic cleanup
                ws.close()

                # Wait for server to detect disconnect and cleanup
                max_cleanup_wait = 3.0
                elapsed = 0.0

                while elapsed < max_cleanup_wait and game_id in server.active_games:
                    await asyncio.sleep(0.2)
                    elapsed += 0.2

                # Verify automatic cleanup
                assert len(server.active_games) == 0
                assert len(server.player_to_game) == 0
                assert len(server.waiting_queues[4]["single"]) == 0

            finally:
                if handler_task and not handler_task.done():
                    handler_task.cancel()
                    try:
                        await handler_task
                    except asyncio.CancelledError:
                        pass

                # Small delay between cycles
                await asyncio.sleep(0.5)

        # Final verification: no state should remain
        assert len(server.active_games) == 0
        assert len(server.waiting_games) == 0
        assert len(server.player_to_game) == 0
        assert len(server.game_creators) == 0
