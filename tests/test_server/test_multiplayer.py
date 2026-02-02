"""
Tests for multiplayer game scenarios, including multiple players joining, disconnecting, and quitting.
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


class TestMultiplayerJoinFlow:
    """Test multiplayer game join scenarios."""

    @pytest.mark.asyncio
    async def test_multiple_players_join_queue(
        self, clean_server_state, running_game_manager
    ):
        """Test that multiple players can join queue and game starts automatically."""

        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        ws3 = MockWebSocket()
        handler1_task = None
        handler2_task = None
        handler3_task = None

        try:
            # Player 1 joins
            ws1.queue_message(
                {
                    "type": "player_join",
                    "name": "Player1",
                    "avatar": "avatar1",
                    "num_players": 4,
                    "game_mode": "multiplayer",
                }
            )

            handler1_task = asyncio.create_task(server.websocket_endpoint(ws1))
            await asyncio.sleep(0.5)

            # Verify Player 1 is in queue
            assert len(server.waiting_queues[4]["multiplayer"]) == 1
            queue_msgs1 = ws1.get_sent_messages_of_type("queue_joined")
            assert len(queue_msgs1) == 1
            assert queue_msgs1[0]["num_connected"] == 1

            # Player 2 joins
            ws2.queue_message(
                {
                    "type": "player_join",
                    "name": "Player2",
                    "avatar": "avatar2",
                    "num_players": 4,
                    "game_mode": "multiplayer",
                }
            )

            handler2_task = asyncio.create_task(server.websocket_endpoint(ws2))
            await asyncio.sleep(0.5)

            # Verify both players are in queue and game has not yet started
            assert len(server.waiting_queues[4]["multiplayer"]) == 2
            assert len(server.active_games) == 0

            # Player 3 joins: now game can start
            ws3.queue_message(
                {
                    "type": "player_join",
                    "name": "Player3",
                    "avatar": "avatar3",
                    "num_players": 4,
                    "game_mode": "multiplayer",
                }
            )
            handler3_task = asyncio.create_task(server.websocket_endpoint(ws3))

            # Wait for game_manager to start the game
            max_wait = 3.5
            elapsed = 0.0

            while elapsed < max_wait and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Verify game was created
            assert len(server.active_games) == 1

            game = list(server.active_games.values())[0]
            assert game.num_players == 4
            assert game.game_mode == "multiplayer"

            # Verify 2 human players and 2 bots
            human_players = [p for p in game.players if p.type == "human"]
            bot_players = [p for p in game.players if p.type != "human"]
            assert len(human_players) == 3
            assert len(bot_players) == 1

            # Verify player names
            player_names = {p.name for p in human_players}
            assert "Player1" in player_names
            assert "Player2" in player_names
            assert "Player3" in player_names

        finally:
            ws1.close()
            ws2.close()
            ws3.close()

            if handler1_task and not handler1_task.done():
                handler1_task.cancel()
                try:
                    await handler1_task
                except asyncio.CancelledError:
                    pass

            if handler2_task and not handler2_task.done():
                handler2_task.cancel()
                try:
                    await handler2_task
                except asyncio.CancelledError:
                    pass

            if handler3_task and not handler3_task.done():
                handler3_task.cancel()
                try:
                    await handler3_task
                except asyncio.CancelledError:
                    pass

            # Cleanup
            for game_id in list(server.active_games.keys()):
                server.active_games[game_id].game_over = True
            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_game_waits_for_minimum_players(
        self, clean_server_state, running_game_manager
    ):
        """Test that game doesn't start until minimum number of players join."""

        ws1 = MockWebSocket()
        handler1_task = None

        try:
            # Single player joins multiplayer queue
            ws1.queue_message(
                {
                    "type": "player_join",
                    "name": "Player1",
                    "avatar": "avatar1",
                    "num_players": 4,
                    "game_mode": "multiplayer",
                }
            )

            handler1_task = asyncio.create_task(server.websocket_endpoint(ws1))
            await asyncio.sleep(0.5)

            # Verify player is in queue
            assert len(server.waiting_queues[4]["multiplayer"]) == 1

            # Wait and verify game does NOT start (need min_human_players)
            await asyncio.sleep(2.0)

            # Game should not have started with only 1 player
            assert len(server.active_games) == 0

            # Player should still be in queue
            assert len(server.waiting_queues[4]["multiplayer"]) == 1

        finally:
            ws1.close()

            if handler1_task and not handler1_task.done():
                handler1_task.cancel()
                try:
                    await handler1_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)


class TestMultiplayerDisconnection:
    """Test handling of player disconnection in multiplayer games."""

    @pytest.mark.asyncio
    async def test_one_player_disconnects_game_continues(
        self, clean_server_state, running_game_manager
    ):
        """Test that game continues when one player disconnects but others remain."""

        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        ws3 = MockWebSocket()
        handler1_task = None
        handler2_task = None
        handler3_task = None

        try:
            # All players join
            ws1.queue_message(
                {
                    "type": "player_join",
                    "name": "Player1",
                    "avatar": "avatar1",
                    "num_players": 4,
                    "game_mode": "multiplayer",
                }
            )

            ws2.queue_message(
                {
                    "type": "player_join",
                    "name": "Player2",
                    "avatar": "avatar2",
                    "num_players": 4,
                    "game_mode": "multiplayer",
                }
            )

            ws3.queue_message(
                {
                    "type": "player_join",
                    "name": "Player3",
                    "avatar": "avatar3",
                    "num_players": 4,
                    "game_mode": "multiplayer",
                }
            )

            handler1_task = asyncio.create_task(server.websocket_endpoint(ws1))
            handler2_task = asyncio.create_task(server.websocket_endpoint(ws2))
            handler3_task = asyncio.create_task(server.websocket_endpoint(ws3))
            await asyncio.sleep(0.5)

            # Wait for game to start
            max_wait = 3.5
            elapsed = 0.0

            while elapsed < max_wait and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            assert len(server.active_games) == 1
            game_id = list(server.active_games.keys())[0]
            game = server.active_games[game_id]

            # Get player references
            human_players = [p for p in game.players if p.type == "human"]
            player1 = next(p for p in human_players if p.name == "Player1")
            player2 = next(p for p in human_players if p.name == "Player2")
            player3 = next(p for p in human_players if p.name == "Player3")

            assert player1.connected == True
            assert player2.connected == True
            assert player3.connected == True

            # Player 1 disconnects
            ws1.close()
            await asyncio.sleep(1.0)

            # Player 1 should be replaced with a bot (not disconnected from game)
            # Game should still be active
            assert game_id in server.active_games

            human_players = [p for p in game.players if p.type == "human"]
            assert len(human_players) == 2
            assert "Player1_bot" in [p.name for p in game.players]
            bot_players = [p for p in game.players if p.type == "bot"]
            assert len(bot_players) == 2

            # Players 2 and 3 should still be connected
            assert player2.connected == True
            assert player3.connected == True

        finally:
            ws1.close()
            ws2.close()
            ws3.close()

            if handler1_task and not handler1_task.done():
                handler1_task.cancel()
                try:
                    await handler1_task
                except asyncio.CancelledError:
                    pass

            if handler2_task and not handler2_task.done():
                handler2_task.cancel()
                try:
                    await handler2_task
                except asyncio.CancelledError:
                    pass

            if handler3_task and not handler3_task.done():
                handler3_task.cancel()
                try:
                    await handler3_task
                except asyncio.CancelledError:
                    pass

            # Cleanup
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True
            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_all_players_disconnect_game_ends(
        self, clean_server_state, running_game_manager
    ):
        """Test that game ends when all human players disconnect."""

        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        handler1_task = None
        handler2_task = None

        try:
            # Both players join
            ws1.queue_message(
                {
                    "type": "player_join",
                    "name": "Player1",
                    "avatar": "avatar1",
                    "num_players": 3,
                    "game_mode": "multiplayer",
                }
            )

            ws2.queue_message(
                {
                    "type": "player_join",
                    "name": "Player2",
                    "avatar": "avatar2",
                    "num_players": 3,
                    "game_mode": "multiplayer",
                }
            )

            handler1_task = asyncio.create_task(server.websocket_endpoint(ws1))
            handler2_task = asyncio.create_task(server.websocket_endpoint(ws2))
            await asyncio.sleep(0.5)

            # Wait for game to start
            max_wait = 3.5
            elapsed = 0.0

            while elapsed < max_wait and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            assert len(server.active_games) == 1
            game_id = list(server.active_games.keys())[0]
            game = server.active_games[game_id]

            # Both players disconnect
            ws1.close()
            ws2.close()

            await asyncio.sleep(1.5)

            # Wait for game to be cleaned up
            max_cleanup_wait = 3.0
            elapsed = 0.0

            while elapsed < max_cleanup_wait and game_id in server.active_games:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Game should be removed
            assert game_id not in server.active_games

            # All mappings should be cleaned
            assert id(ws1) not in server.player_to_game
            assert id(ws2) not in server.player_to_game

        finally:
            if handler1_task and not handler1_task.done():
                handler1_task.cancel()
                try:
                    await handler1_task
                except asyncio.CancelledError:
                    pass

            if handler2_task and not handler2_task.done():
                handler2_task.cancel()
                try:
                    await handler2_task
                except asyncio.CancelledError:
                    pass

            # Cleanup
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True
            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_player_quits_explicitly_in_multiplayer(
        self, clean_server_state, running_game_manager
    ):
        """Test explicit quit in multiplayer game."""

        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        handler1_task = None
        handler2_task = None

        try:
            # Both players join
            ws1.queue_message(
                {
                    "type": "player_join",
                    "name": "Player1",
                    "avatar": "avatar1",
                    "num_players": 3,
                    "game_mode": "multiplayer",
                }
            )

            ws2.queue_message(
                {
                    "type": "player_join",
                    "name": "Player2",
                    "avatar": "avatar2",
                    "num_players": 3,
                    "game_mode": "multiplayer",
                }
            )

            handler1_task = asyncio.create_task(server.websocket_endpoint(ws1))
            handler2_task = asyncio.create_task(server.websocket_endpoint(ws2))
            await asyncio.sleep(0.5)

            # Wait for game to start
            max_wait = 3.5
            elapsed = 0.0

            while elapsed < max_wait and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            assert len(server.active_games) == 1
            game_id = list(server.active_games.keys())[0]

            # Player 1 sends quit message
            ws1.queue_message({"type": "quit"})
            await asyncio.sleep(1.0)

            # Player 1 should receive quit_confirmed
            quit_msgs = ws1.get_sent_messages_of_type("quit_confirmed")
            assert len(quit_msgs) >= 1

            # Game should still be active (Player 2 still playing)
            assert game_id in server.active_games

        finally:
            ws1.close()
            ws2.close()

            if handler1_task and not handler1_task.done():
                handler1_task.cancel()
                try:
                    await handler1_task
                except asyncio.CancelledError:
                    pass

            if handler2_task and not handler2_task.done():
                handler2_task.cancel()
                try:
                    await handler2_task
                except asyncio.CancelledError:
                    pass

            # Cleanup
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True
            await asyncio.sleep(0.5)


class TestMultiplayerStateManagement:
    """Test state management across multiple multiplayer games."""

    @pytest.mark.asyncio
    async def test_multiple_concurrent_games(
        self, clean_server_state, running_game_manager
    ):
        """Test that multiple multiplayer games can run concurrently."""

        # Create 4 players (2 games of 2 players each)
        websockets = [MockWebSocket() for _ in range(4)]
        handler_tasks = []

        try:
            # All 4 players join queue
            for i, ws in enumerate(websockets):
                ws.queue_message(
                    {
                        "type": "player_join",
                        "name": f"Player{i + 1}",
                        "avatar": f"avatar{i + 1}",
                        "num_players": 3,
                        "game_mode": "multiplayer",
                    }
                )

                task = asyncio.create_task(server.websocket_endpoint(ws))
                handler_tasks.append(task)
                await asyncio.sleep(0.3)

            # Wait for games to start
            max_wait = 4.0
            elapsed = 0.0

            while elapsed < max_wait and len(server.active_games) < 2:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Should have 2 games (each with 2 humans + 2 bots)
            assert len(server.active_games) == 2

            # Verify each game has correct player count
            for game in server.active_games.values():
                human_players = [p for p in game.players if p.type == "human"]
                assert len(human_players) == 2
                assert game.num_players == 3

        finally:
            # Close all websockets
            for ws in websockets:
                ws.close()

            # Cancel all handlers
            for task in handler_tasks:
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            # Cleanup
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True
            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_no_state_leaks_multiplayer_cycles(
        self, clean_server_state, running_game_manager
    ):
        """Test no state leaks across multiple multiplayer game cycles."""

        for cycle in range(2):
            ws1 = MockWebSocket()
            ws2 = MockWebSocket()
            handler1_task = None
            handler2_task = None

            try:
                # Players join
                ws1.queue_message(
                    {
                        "type": "player_join",
                        "name": f"Player1_C{cycle}",
                        "avatar": "avatar1",
                        "num_players": 3,
                        "game_mode": "multiplayer",
                    }
                )

                ws2.queue_message(
                    {
                        "type": "player_join",
                        "name": f"Player2_C{cycle}",
                        "avatar": "avatar2",
                        "num_players": 3,
                        "game_mode": "multiplayer",
                    }
                )

                handler1_task = asyncio.create_task(server.websocket_endpoint(ws1))
                handler2_task = asyncio.create_task(server.websocket_endpoint(ws2))
                await asyncio.sleep(0.5)

                # Wait for game to start
                max_wait = 3.5
                elapsed = 0.0

                while elapsed < max_wait and len(server.active_games) == 0:
                    await asyncio.sleep(0.2)
                    elapsed += 0.2

                assert len(server.active_games) == 1
                game_id = list(server.active_games.keys())[0]

                # Both disconnect
                ws1.close()
                ws2.close()

                # Wait for cleanup
                max_cleanup_wait = 3.0
                elapsed = 0.0

                while elapsed < max_cleanup_wait and game_id in server.active_games:
                    await asyncio.sleep(0.2)
                    elapsed += 0.2

                # Verify cleanup
                assert len(server.active_games) == 0
                assert len(server.player_to_game) == 0
                assert len(server.waiting_queues[3]["multiplayer"]) == 0

            finally:
                if handler1_task and not handler1_task.done():
                    handler1_task.cancel()
                    try:
                        await handler1_task
                    except asyncio.CancelledError:
                        pass

                if handler2_task and not handler2_task.done():
                    handler2_task.cancel()
                    try:
                        await handler2_task
                    except asyncio.CancelledError:
                        pass

                # Delay between cycles
                await asyncio.sleep(1.5)

        # Final verification
        assert len(server.active_games) == 0
        assert len(server.waiting_games) == 0
        assert len(server.player_to_game) == 0
        assert len(server.game_creators) == 0
