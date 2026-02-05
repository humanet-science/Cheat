"""
Tests for game creation with key sharing scenarios.
Tests what happens when players create games, share keys, and leave queues.
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


class TestGameCreation:
    """Test game creation and key sharing functionality."""

    @pytest.mark.asyncio
    async def test_create_game_with_key(self, clean_server_state):
        """Test that a player can create a game and receive a game key."""

        ws_creator = MockWebSocket()
        handler_task = None

        try:
            # Player creates a game
            ws_creator.queue_message(
                {
                    "type": "create_game",
                    "name": "Creator",
                    "avatar": "avatar1",
                    "num_humans": 2,
                    "num_bots": 2,
                }
            )

            handler_task = asyncio.create_task(server.websocket_endpoint(ws_creator))
            await asyncio.sleep(0.5)

            # Should receive game_created message with key
            game_created_msgs = ws_creator.get_sent_messages_of_type("game_created")
            assert len(game_created_msgs) == 1

            game_key = game_created_msgs[0]["key"]
            assert game_key is not None, "Game key should not be None"

            # Game should be in waiting_games
            assert game_key in server.waiting_games

            # Creator should be marked as game creator and mapped to correct game
            assert id(ws_creator) in server.game_creators
            assert server.game_creators[id(ws_creator)] == game_key
            assert list(server.player_to_game.keys()) == [id(ws_creator)]

            # Game should have 2 human slots (1 filled, 1 empty)
            game = server.waiting_games[game_key]
            human_players = [p for p in game.players if p.type == "human"]
            assert len(human_players) == 2

            connected_humans = [p for p in human_players if p.connected]
            assert len(connected_humans) == 1
            assert connected_humans[0].name == "Creator"

        finally:
            ws_creator.close()
            if handler_task and not handler_task.done():
                handler_task.cancel()
                try:
                    await handler_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)

            assert server.player_to_game == {}

    @pytest.mark.asyncio
    async def test_player_joins_with_valid_key(self, clean_server_state):
        """Test that a player can join a game using a valid key."""

        ws_creator = MockWebSocket()
        ws_joiner = MockWebSocket()
        creator_task = None
        joiner_task = None

        try:
            # Creator creates game
            ws_creator.queue_message(
                {
                    "type": "create_game",
                    "name": "Creator",
                    "avatar": "avatar1",
                    "num_humans": 2,
                    "num_bots": 2,
                }
            )

            creator_task = asyncio.create_task(server.websocket_endpoint(ws_creator))
            await asyncio.sleep(0.5)

            # Get the game key
            game_created_msgs = ws_creator.get_sent_messages_of_type("game_created")
            game_key = game_created_msgs[0]["key"]

            # Another player joins with the key
            ws_joiner.queue_message(
                {
                    "type": "player_join",
                    "name": "Joiner",
                    "avatar": "avatar2",
                    "game_key": game_key,
                }
            )

            joiner_task = asyncio.create_task(server.websocket_endpoint(ws_joiner))
            await asyncio.sleep(0.5)

            # Both players should have received queue_joined messages
            creator_queue_msgs = ws_creator.get_sent_messages_of_type("queue_joined")
            joiner_queue_msgs = ws_joiner.get_sent_messages_of_type("queue_joined")

            # Check the latest queue_joined message shows 2 connected
            assert len(creator_queue_msgs) > 0
            latest_msg = creator_queue_msgs[-1]
            assert latest_msg["num_connected"] == 2
            assert latest_msg["num_slots"] == 2

            # Game should have both players
            game = server.waiting_games[game_key]
            connected_humans = [
                p for p in game.players if p.type == "human" and p.connected
            ]
            assert len(connected_humans) == 2
            assert set(server.player_to_game.keys()) == {id(ws_creator), id(ws_joiner)}

            player_names = {p.name for p in connected_humans}
            assert "Creator" in player_names
            assert "Joiner" in player_names

        finally:
            ws_creator.close()
            ws_joiner.close()

            if creator_task and not creator_task.done():
                creator_task.cancel()
                try:
                    await creator_task
                except asyncio.CancelledError:
                    pass

            if joiner_task and not joiner_task.done():
                joiner_task.cancel()
                try:
                    await joiner_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)

            assert server.player_to_game == {}

    @pytest.mark.asyncio
    async def test_join_with_invalid_key(self, clean_server_state):
        """Test that joining with an invalid key is rejected."""

        ws_joiner = MockWebSocket()
        joiner_task = None

        try:
            # Try to join with invalid key
            ws_joiner.queue_message(
                {
                    "type": "player_join",
                    "name": "Joiner",
                    "avatar": "avatar2",
                    "game_key": "invalid_key_12345",
                }
            )

            joiner_task = asyncio.create_task(server.websocket_endpoint(ws_joiner))
            await asyncio.sleep(0.5)

            # Should receive invalid_key message
            invalid_key_msgs = ws_joiner.get_sent_messages_of_type("invalid_key")
            assert len(invalid_key_msgs) == 1
            assert "not valid" in invalid_key_msgs[0]["message"].lower()

            # Check they have not been added to the dict
            assert id(ws_joiner) not in server.player_to_game.keys()

        finally:
            ws_joiner.close()
            if joiner_task and not joiner_task.done():
                joiner_task.cancel()
                try:
                    await joiner_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_join_already_started_game(
        self, clean_server_state, running_game_manager
    ):
        """Test that joining a game that has already started is rejected."""

        ws_creator = MockWebSocket()
        ws_joiner1 = MockWebSocket()
        ws_late_joiner = MockWebSocket()
        creator_task = None
        joiner1_task = None
        late_joiner_task = None

        try:
            # Creator creates game for 2 humans
            ws_creator.queue_message(
                {
                    "type": "create_game",
                    "name": "Creator",
                    "avatar": "avatar1",
                    "num_humans": 2,
                    "num_bots": 2,
                }
            )

            creator_task = asyncio.create_task(server.websocket_endpoint(ws_creator))
            await asyncio.sleep(0.5)

            game_key = ws_creator.get_sent_messages_of_type("game_created")[0]["key"]

            # First joiner joins
            ws_joiner1.queue_message(
                {
                    "type": "player_join",
                    "name": "Joiner1",
                    "avatar": "avatar2",
                    "game_key": game_key,
                }
            )

            joiner1_task = asyncio.create_task(server.websocket_endpoint(ws_joiner1))
            await asyncio.sleep(0.5)

            # Game should be full and ready to start
            # Wait for game_manager to move it to active_games
            max_wait = 3.5
            elapsed = 0.0

            while elapsed < max_wait and game_key in server.waiting_games:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Game should now be in active_games, not waiting_games
            assert game_key not in server.waiting_games
            assert game_key in server.active_games

            # Late joiner tries to join with the same key
            ws_late_joiner.queue_message(
                {
                    "type": "player_join",
                    "name": "LateJoiner",
                    "avatar": "avatar3",
                    "game_key": game_key,
                }
            )

            late_joiner_task = asyncio.create_task(
                server.websocket_endpoint(ws_late_joiner)
            )
            await asyncio.sleep(0.5)

            # Should receive invalid_key message (game already in progress)
            invalid_key_msgs = ws_late_joiner.get_sent_messages_of_type("invalid_key")
            assert len(invalid_key_msgs) == 1
            assert "already in progress" in invalid_key_msgs[0]["message"].lower()

            # Check they have not been added to the dict
            assert id(ws_late_joiner) not in server.player_to_game.keys()

        finally:
            ws_creator.close()
            ws_joiner1.close()
            ws_late_joiner.close()

            for task in [creator_task, joiner1_task, late_joiner_task]:
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            # Cleanup game
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True

            await asyncio.sleep(0.5)

            assert server.player_to_game == {}


class TestGameCreatorCancellation:
    """Test what happens when game creator cancels the game."""

    @pytest.mark.asyncio
    async def test_creator_cancels_game_alone(self, clean_server_state):
        """Test creator canceling game when they're the only player."""

        ws_creator = MockWebSocket()
        creator_task = None

        try:
            # Creator creates game
            ws_creator.queue_message(
                {
                    "type": "create_game",
                    "name": "Creator",
                    "avatar": "avatar1",
                    "num_humans": 2,
                    "num_bots": 2,
                }
            )

            creator_task = asyncio.create_task(server.websocket_endpoint(ws_creator))
            await asyncio.sleep(0.5)

            game_key = ws_creator.get_sent_messages_of_type("game_created")[0]["key"]

            # Verify game exists
            assert game_key in server.waiting_games
            assert id(ws_creator) in server.game_creators

            # Verify only game creator in player_to_game
            assert list(server.player_to_game.keys()) == [id(ws_creator)]

            # Creator exits queue
            ws_creator.queue_message({"type": "exit_queue"})
            await asyncio.sleep(0.5)

            # Game should be removed from waiting_games
            assert game_key not in server.waiting_games

            # Creator should be removed from game_creators
            assert id(ws_creator) not in server.game_creators
            assert server.player_to_game == {}

            # Creator should receive game_cancelled message
            cancelled_msgs = ws_creator.get_sent_messages_of_type("game_cancelled")
            assert len(cancelled_msgs) == 1

        finally:
            ws_creator.close()
            if creator_task and not creator_task.done():
                creator_task.cancel()
                try:
                    await creator_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_creator_cancels_with_other_players_waiting(self, clean_server_state):
        """Test that all players are notified when creator cancels."""

        ws_creator = MockWebSocket()
        ws_joiner = MockWebSocket()
        creator_task = None
        joiner_task = None

        try:
            # Creator creates game
            ws_creator.queue_message(
                {
                    "type": "create_game",
                    "name": "Creator",
                    "avatar": "avatar1",
                    "num_humans": 3,
                    "num_bots": 2,
                }
            )

            creator_task = asyncio.create_task(server.websocket_endpoint(ws_creator))
            await asyncio.sleep(0.5)

            game_key = ws_creator.get_sent_messages_of_type("game_created")[0]["key"]

            # Joiner joins
            ws_joiner.queue_message(
                {
                    "type": "player_join",
                    "name": "Joiner",
                    "avatar": "avatar2",
                    "game_key": game_key,
                }
            )

            joiner_task = asyncio.create_task(server.websocket_endpoint(ws_joiner))
            await asyncio.sleep(0.5)

            assert set(server.player_to_game.keys()) == {id(ws_creator), id(ws_joiner)}

            # Creator exits queue (cancels game)
            ws_creator.queue_message({"type": "exit_queue"})
            await asyncio.sleep(0.5)

            # Game should be removed
            assert game_key not in server.waiting_games

            # Both players should receive game_cancelled message
            creator_cancelled = ws_creator.get_sent_messages_of_type("game_cancelled")
            joiner_cancelled = ws_joiner.get_sent_messages_of_type("game_cancelled")

            # Player to dict should be empty
            assert server.player_to_game == {}

            assert len(creator_cancelled) >= 1
            assert len(joiner_cancelled) >= 1

        finally:
            ws_creator.close()
            ws_joiner.close()

            if creator_task and not creator_task.done():
                creator_task.cancel()
                try:
                    await creator_task
                except asyncio.CancelledError:
                    pass

            if joiner_task and not joiner_task.done():
                joiner_task.cancel()
                try:
                    await joiner_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)

            assert server.player_to_game == {}


class TestNonCreatorLeaving:
    """Test what happens when a non-creator leaves the queue."""

    @pytest.mark.asyncio
    async def test_non_creator_leaves_queue(self, clean_server_state):
        """Test that non-creator can leave queue without canceling game."""

        ws_creator = MockWebSocket()
        ws_joiner = MockWebSocket()
        creator_task = None
        joiner_task = None

        try:
            # Creator creates game
            ws_creator.queue_message(
                {
                    "type": "create_game",
                    "name": "Creator",
                    "avatar": "avatar1",
                    "num_humans": 3,
                    "num_bots": 2,
                }
            )

            creator_task = asyncio.create_task(server.websocket_endpoint(ws_creator))
            await asyncio.sleep(0.5)

            game_key = ws_creator.get_sent_messages_of_type("game_created")[0]["key"]

            # Joiner joins
            ws_joiner.queue_message(
                {
                    "type": "player_join",
                    "name": "Joiner",
                    "avatar": "avatar2",
                    "game_key": game_key,
                }
            )

            joiner_task = asyncio.create_task(server.websocket_endpoint(ws_joiner))
            await asyncio.sleep(0.5)

            # Verify both are waiting
            game = server.waiting_games[game_key]
            connected_before = [
                p for p in game.players if p.type == "human" and p.connected
            ]
            assert len(connected_before) == 2

            # Check they are in player_to_server
            assert set(server.player_to_game) == {id(ws_creator), id(ws_joiner)}

            # Joiner exits queue
            ws_joiner.queue_message({"type": "exit_queue"})
            await asyncio.sleep(0.5)

            # Game should still exist
            assert game_key in server.waiting_games
            assert list(server.player_to_game.keys()) == [id(ws_creator)]

            # Joiner should be disconnected but creator still connected
            connected_after = [
                p for p in game.players if p.type == "human" and p.connected
            ]
            assert len(connected_after) == 1
            assert connected_after[0].name == "Creator"

            # Creator should receive player_exited_queue message
            exit_msgs = ws_creator.get_sent_messages_of_type("player_exited_queue")
            assert len(exit_msgs) >= 1

            latest_exit = exit_msgs[-1]
            assert latest_exit["num_connected"] == 1
            assert latest_exit["num_slots"] == 3

        finally:
            ws_creator.close()
            ws_joiner.close()

            if creator_task and not creator_task.done():
                creator_task.cancel()
                try:
                    await creator_task
                except asyncio.CancelledError:
                    pass

            if joiner_task and not joiner_task.done():
                joiner_task.cancel()
                try:
                    await joiner_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)

            assert server.player_to_game == {}

    @pytest.mark.asyncio
    async def test_multiple_joiners_leave_sequentially(self, clean_server_state):
        """Test multiple non-creators leaving one by one."""

        ws_creator = MockWebSocket()
        ws_joiner1 = MockWebSocket()
        ws_joiner2 = MockWebSocket()
        creator_task = None
        joiner1_task = None
        joiner2_task = None

        try:
            # Creator creates game for 3 humans
            ws_creator.queue_message(
                {
                    "type": "create_game",
                    "name": "Creator",
                    "avatar": "avatar1",
                    "num_humans": 3,
                    "num_bots": 1,
                }
            )

            creator_task = asyncio.create_task(server.websocket_endpoint(ws_creator))
            await asyncio.sleep(0.5)

            game_key = ws_creator.get_sent_messages_of_type("game_created")[0]["key"]

            # Two joiners join
            ws_joiner1.queue_message(
                {
                    "type": "player_join",
                    "name": "Joiner1",
                    "avatar": "avatar2",
                    "game_key": game_key,
                }
            )

            ws_joiner2.queue_message(
                {
                    "type": "player_join",
                    "name": "Joiner2",
                    "avatar": "avatar3",
                    "game_key": game_key,
                }
            )

            joiner1_task = asyncio.create_task(server.websocket_endpoint(ws_joiner1))
            await asyncio.sleep(0.3)
            joiner2_task = asyncio.create_task(server.websocket_endpoint(ws_joiner2))
            await asyncio.sleep(0.5)

            # All 3 should be connected
            game = server.waiting_games[game_key]
            connected = [p for p in game.players if p.type == "human" and p.connected]
            assert len(connected) == 3
            assert set(server.player_to_game.keys()) == {
                id(ws_creator),
                id(ws_joiner1),
                id(ws_joiner2),
            }

            # Joiner1 leaves
            ws_joiner1.queue_message({"type": "exit_queue"})
            await asyncio.sleep(0.5)

            connected = [p for p in game.players if p.type == "human" and p.connected]
            assert len(connected) == 2
            assert game_key in server.waiting_games, "Game should still exist"
            assert set(server.player_to_game.keys()) == {id(ws_creator), id(ws_joiner2)}

            # Joiner2 leaves
            ws_joiner2.queue_message({"type": "exit_queue"})
            await asyncio.sleep(0.5)

            connected = [p for p in game.players if p.type == "human" and p.connected]
            assert len(connected) == 1
            assert connected[0].name == "Creator"
            assert (
                game_key in server.waiting_games
            ), "Game should still exist with only creator"
            assert set(server.player_to_game.keys()) == {id(ws_creator)}

        finally:
            ws_creator.close()
            ws_joiner1.close()
            ws_joiner2.close()

            for task in [creator_task, joiner1_task, joiner2_task]:
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            await asyncio.sleep(0.5)

            assert server.player_to_game == {}
