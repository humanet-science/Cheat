"""
Tests for Empirica integration functionality.
Tests participant registration, game creation from config, and survey flow.
"""

# Add the project root to Python path
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), '..'), '..')))

import pytest
import asyncio
from fastapi.testclient import TestClient
import cheat.server as server
from pathlib import Path
import yaml

from tests.utils import MockWebSocket


class TestEmpiricaParticipantRegistration:
    """Test Empirica participant registration via WebSocket."""

    @pytest.mark.asyncio
    async def test_participant_joins_survey_queue(self, clean_server_state):
        """Test that a participant can register with Empirica ID."""

        ws = MockWebSocket()
        handler_task = None

        try:
            # Participant joins with Empirica ID
            ws.queue_message({
                "type": "empirica_join",
                "empirica_id": "participant_12345",
                "name": "Participant1",
                "avatar": "avatar1"
            })

            handler_task = asyncio.create_task(server.websocket_endpoint(ws))
            await asyncio.sleep(0.5)

            # Should receive player_registered message
            registered_msgs = ws.get_sent_messages_of_type("player_registered")
            assert len(registered_msgs) == 1, \
                "Should receive player_registered message"

            assert "participant_12345" in registered_msgs[0]["message"]

            # Participant should be in survey_participants dict
            assert "participant_12345" in server.survey_participants, \
                "Participant should be registered in survey_participants"

            participant = server.survey_participants["participant_12345"]
            assert participant.name == "Participant1"
            assert participant.avatar == "avatar1"
            assert participant.empirica_id == "participant_12345"

        finally:
            ws.close()
            if handler_task and not handler_task.done():
                handler_task.cancel()
                try:
                    await handler_task
                except asyncio.CancelledError:
                    pass

            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_multiple_participants_register(self, clean_server_state):
        """Test that multiple participants can register independently."""

        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        ws3 = MockWebSocket()
        handler1_task = None
        handler2_task = None
        handler3_task = None

        try:
            # Three participants register
            for ws, empirica_id, name in [
                (ws1, "part_001", "Alice"),
                (ws2, "part_002", "Bob"),
                (ws3, "part_003", "Charlie")
            ]:
                ws.queue_message({
                    "type": "empirica_join",
                    "empirica_id": empirica_id,
                    "name": name,
                    "avatar": f"avatar_{name}"
                })

            handler1_task = asyncio.create_task(server.websocket_endpoint(ws1))
            handler2_task = asyncio.create_task(server.websocket_endpoint(ws2))
            handler3_task = asyncio.create_task(server.websocket_endpoint(ws3))

            await asyncio.sleep(0.5)

            # All should be registered
            assert len(server.survey_participants) == 3
            assert "part_001" in server.survey_participants
            assert "part_002" in server.survey_participants
            assert "part_003" in server.survey_participants

            # Check names
            assert server.survey_participants["part_001"].name == "Alice"
            assert server.survey_participants["part_002"].name == "Bob"
            assert server.survey_participants["part_003"].name == "Charlie"

        finally:
            for ws in [ws1, ws2, ws3]:
                ws.close()

            for task in [handler1_task, handler2_task, handler3_task]:
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            await asyncio.sleep(0.5)


class TestEmpiricaGameCreation:
    """Test game creation from Empirica configuration."""

    @pytest.mark.asyncio
    async def test_create_game_from_config_endpoint(self, clean_server_state):
        """Test creating a game via the /api/games/from_config endpoint."""

        # First, register participants
        participants = []
        for i in range(2):
            ws = MockWebSocket()
            ws.queue_message({
                "type": "empirica_join",
                "empirica_id": f"emp_{i}",
                "name": f"Player{i}",
                "avatar": f"avatar{i}"
            })

            task = asyncio.create_task(server.websocket_endpoint(ws))
            participants.append((ws, task))
            await asyncio.sleep(0.3)

        await asyncio.sleep(0.5)

        # Verify participants are registered
        assert len(server.survey_participants) == 2

        try:
            # Create test config file (minimal)
            test_config = {
                "players": [
                    {"type": "human"},
                    {"type": "human"},
                    {"type": "RandomBot", "name": "Bot1"},
                    {"type": "RandomBot", "name": "Bot2"}
                ],
                "game": {
                    "n_rounds": 3,
                    "experimental_mode": True
                }
            }

            # Create temporary config file
            experiments_dir = Path(__file__).parent.parent.parent / "experiments"
            experiments_dir.mkdir(exist_ok=True)

            test_config_path = experiments_dir / "test_empirica.yaml"
            with open(test_config_path, 'w') as f:
                yaml.dump(test_config, f)

            # Use TestClient to make API request
            with TestClient(server.app) as client:
                response = client.post("/api/games/from_config", json={
                    "cfg": {
                        "cfg_key": "test_empirica",
                        "game_id": "empirica_game_001",
                        "n_rounds": 5,
                        "players": ["emp_0", "emp_1"]
                    }
                })

                assert response.status_code == 200

            # Give it time to process
            await asyncio.sleep(0.5)

            # Game should be in waiting_games
            assert "empirica_game_001" in server.waiting_games, \
                "Game should be created in waiting_games"

            game = server.waiting_games["empirica_game_001"]

            # Verify game properties
            assert game.game_id == "empirica_game_001"
            assert game.num_rounds == 5  # Should use the value from request

            # Verify players
            human_players = [p for p in game.players if p.type == "human"]
            bot_players = [p for p in game.players if p.type == "bot"]

            assert len(human_players) == 2
            assert len(bot_players) == 2

            # Verify human players are the registered participants
            human_names = {p.name for p in human_players}
            assert "Player0" in human_names
            assert "Player1" in human_names

            # Verify participants were removed from survey_participants
            assert "emp_0" not in server.survey_participants
            assert "emp_1" not in server.survey_participants

            print("✓ Game created from config successfully")

        finally:
            # Cleanup
            for ws, task in participants:
                ws.close()
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            # Remove test config file
            if test_config_path.exists():
                test_config_path.unlink()

            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_game_config_overrides_base_config(self, clean_server_state):
        """Test that game config properly overrides base configuration."""

        # Register participants
        participants = []
        for i in range(2):
            ws = MockWebSocket()
            ws.queue_message({
                "type": "empirica_join",
                "empirica_id": f"emp_{i}",
                "name": f"Player{i}",
                "avatar": f"avatar{i}"
            })

            task = asyncio.create_task(server.websocket_endpoint(ws))
            participants.append((ws, task))
            await asyncio.sleep(0.3)

        await asyncio.sleep(0.5)

        try:
            # Create config with specific settings
            test_config = {
                "players": [
                    {"type": "human"},
                    {"type": "human"},
                ],
                "game": {
                    "n_rounds": 10,
                    "experimental_mode": False
                }
            }

            experiments_dir = Path(__file__).parent.parent.parent / "experiments"
            experiments_dir.mkdir(exist_ok=True)
            test_config_path = experiments_dir / "test_override.yaml"

            with open(test_config_path, 'w') as f:
                yaml.dump(test_config, f)

            with TestClient(server.app) as client:
                response = client.post("/api/games/from_config", json={
                    "cfg": {
                        "cfg_key": "test_override",
                        "game_id": "game_override_001",
                        "n_rounds": 3,  # Override the config's n_rounds
                        "players": ["emp_0", "emp_1"]
                    }
                })

                assert response.status_code == 200

            await asyncio.sleep(0.5)

            # Verify override worked
            game = server.waiting_games["game_override_001"]
            assert game.num_rounds == 3, \
                "n_rounds should be overridden by request parameter"

            print("✓ Config override successful")

        finally:
            for ws, task in participants:
                ws.close()
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            if test_config_path.exists():
                test_config_path.unlink()

            await asyncio.sleep(0.5)


class TestEmpiricaGameFlow:
    """Test complete Empirica game flow from registration to game start."""

    @pytest.mark.asyncio
    async def test_full_empirica_flow(
            self,
            clean_server_state,
            running_game_manager
    ):
        """Test complete flow: register participants, create game, game starts."""

        # Step 1: Register participants
        participants = []
        for i in range(2):
            ws = MockWebSocket()
            ws.queue_message({
                "type": "empirica_join",
                "empirica_id": f"emp_{i}",
                "name": f"Player{i}",
                "avatar": f"avatar{i}"
            })

            task = asyncio.create_task(server.websocket_endpoint(ws))
            participants.append((ws, task))
            await asyncio.sleep(0.3)

        await asyncio.sleep(0.5)

        try:
            # Step 2: Create game config
            test_config = {
                "players": [
                    {"type": "human"},
                    {"type": "human"},
                ],
                "game": {
                    "n_rounds": 2,
                    "experimental_mode": True
                }
            }

            experiments_dir = Path(__file__).parent.parent.parent / "experiments"
            experiments_dir.mkdir(exist_ok=True)
            test_config_path = experiments_dir / "test_full_flow.yaml"

            with open(test_config_path, 'w') as f:
                yaml.dump(test_config, f)

            # Step 3: Create game via API
            with TestClient(server.app) as client:
                response = client.post("/api/games/from_config", json={
                    "cfg": {
                        "cfg_key": "test_full_flow",
                        "game_id": "flow_game_001",
                        "n_rounds": 2,
                        "players": ["emp_0", "emp_1"]
                    }
                })

                assert response.status_code == 200

            await asyncio.sleep(0.5)

            # Game should be in waiting_games with both players connected
            assert "flow_game_001" in server.waiting_games
            game = server.waiting_games["flow_game_001"]

            human_players = [p for p in game.players if p.type == "human"]
            assert all(p.connected for p in human_players), \
                "All human players should be connected"

            # Step 4: Wait for game_manager to start the game
            max_wait = 3.5
            elapsed = 0.0

            while elapsed < max_wait and "flow_game_001" in server.waiting_games:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            # Game should have moved to active_games
            assert "flow_game_001" not in server.waiting_games, \
                "Game should have left waiting_games"
            assert "flow_game_001" in server.active_games, \
                "Game should be in active_games"

            active_game = server.active_games["flow_game_001"]
            assert active_game.num_players == 2

            print("✓ Full Empirica flow completed successfully")

        finally:
            for ws, task in participants:
                ws.close()
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            if test_config_path.exists():
                test_config_path.unlink()

            # Cleanup games
            for gid in list(server.active_games.keys()):
                server.active_games[gid].game_over = True

            await asyncio.sleep(0.5)

    @pytest.mark.asyncio
    async def test_missing_participant_handling(self, clean_server_state):
        """Test error handling when trying to create game with unregistered participants."""

        # Only register one participant, but try to create game with two
        ws = MockWebSocket()
        ws.queue_message({
            "type": "empirica_join",
            "empirica_id": "emp_0",
            "name": "Player0",
            "avatar": "avatar0"
        })

        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.5)

        try:
            test_config = {
                "players": [
                    {"type": "human"},
                    {"type": "human"},
                ],
                "game": {"n_rounds": 2}
            }

            experiments_dir = Path(__file__).parent.parent.parent / "experiments"
            experiments_dir.mkdir(exist_ok=True)
            test_config_path = experiments_dir / "test_missing.yaml"

            with open(test_config_path, 'w') as f:
                yaml.dump(test_config, f)

            # Try to create game with missing participant
            with TestClient(server.app) as client:
                # This should raise an error or handle gracefully
                with pytest.raises(Exception):
                    response = client.post("/api/games/from_config", json={
                        "cfg": {
                            "cfg_key": "test_missing",
                            "game_id": "missing_game_001",
                            "n_rounds": 2,
                            "players": ["emp_0", "emp_MISSING"]  # emp_MISSING not registered
                        }
                    })

            print("✓ Missing participant correctly raises error")

        finally:
            ws.close()
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            if test_config_path.exists():
                test_config_path.unlink()

            await asyncio.sleep(0.5)


class TestEmpiricaPlayerMapping:
    """Test player-to-game mapping for Empirica games."""

    @pytest.mark.asyncio
    async def test_player_to_game_mapping_created(self, clean_server_state):
        """Test that player_to_game mappings are created for Empirica players."""

        # Register participants
        participants = []
        for i in range(2):
            ws = MockWebSocket()
            ws.queue_message({
                "type": "empirica_join",
                "empirica_id": f"emp_{i}",
                "name": f"Player{i}",
                "avatar": f"avatar{i}"
            })

            task = asyncio.create_task(server.websocket_endpoint(ws))
            participants.append((ws, task))
            await asyncio.sleep(0.3)

        await asyncio.sleep(0.5)

        try:
            test_config = {
                "players": [{"type": "human"}, {"type": "human"}],
                "game": {"n_rounds": 2}
            }

            experiments_dir = Path(__file__).parent.parent.parent / "experiments"
            experiments_dir.mkdir(exist_ok=True)
            test_config_path = experiments_dir / "test_mapping.yaml"

            with open(test_config_path, 'w') as f:
                yaml.dump(test_config, f)

            with TestClient(server.app) as client:
                response = client.post("/api/games/from_config", json={
                    "cfg": {
                        "cfg_key": "test_mapping",
                        "game_id": "mapping_game_001",
                        "n_rounds": 2,
                        "players": ["emp_0", "emp_1"]
                    }
                })

            await asyncio.sleep(0.5)

            # Check player_to_game mappings exist
            game = server.waiting_games["mapping_game_001"]
            human_players = [p for p in game.players if p.type == "human"]

            for player in human_players:
                assert id(player.ws) in server.player_to_game, \
                    f"Player {player.name} should have player_to_game mapping"
                assert server.player_to_game[id(player.ws)] == "mapping_game_001"

            print("✓ Player mappings created correctly")

        finally:
            for ws, task in participants:
                ws.close()
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            if test_config_path.exists():
                test_config_path.unlink()

            await asyncio.sleep(0.5)