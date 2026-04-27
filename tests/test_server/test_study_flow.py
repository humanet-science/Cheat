"""
Tests for the study flow: participant queue, game assignment, dropout handling,
out_path tracking, and survey saving.
"""

import asyncio
import json
import os
import sys
from collections import deque
from pathlib import Path

import pytest

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), ".."), "..")),
)

import cheat.server as server
from tests.utils import MockWebSocket


def make_study_join(name, prolific_id="test_prolific"):
    return {
        "type": "study_join",
        "name": name,
        "avatar": "🎮",
        "prolific_id": prolific_id,
    }


def make_slot(num_humans=2, max_waiting_time=60, out_dir=None, note="test"):
    """Build a minimal GameSlot for testing."""
    cfg = {
        "game": {
            "experimental_mode": True,
            "out_dir": str(out_dir) if out_dir else None,
            "note": note,
            "game_id": None,
            "n_rounds": 1,
        },
        "experiment": {
            "predefined_messages": None,
        },
        "players": [
            {"type": "human", "name": f"P{i}", "avatar": "🎮"} for i in range(num_humans)
        ],
        "show_logs": False,
        "default_system_prompt": "",
        "predefined_messages": None,
        "min_human_players": {2: 2, 3: 2, 4: 3, 5: 3, 6: 3},
        "max_num_active_games": 50,
    }
    return server.GameSlot(
        config=cfg, num_humans=num_humans, max_waiting_time=max_waiting_time
    )


# ---------------------------------------------------------------------------
# Participant queue
# ---------------------------------------------------------------------------


class TestStudyQueue:
    @pytest.mark.asyncio
    async def test_participant_joins_queue(
        self, clean_server_state, running_game_manager
    ):
        """Participant receives queue_joined after sending study_join."""
        server.schedule.append(make_slot(num_humans=2))

        ws = MockWebSocket()
        ws.queue_message(make_study_join("Alice"))
        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.3)

        assert len(server.study_participants) == 1
        msgs = ws.get_sent_messages_of_type("queue_joined")
        assert len(msgs) == 1
        assert "max_wait_seconds" in msgs[0]

        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    @pytest.mark.asyncio
    async def test_no_games_available_when_schedule_empty(
        self, clean_server_state, running_game_manager
    ):
        """Participant receives no_games_available when schedule is empty."""
        ws = MockWebSocket()
        ws.queue_message(make_study_join("Alice"))
        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.3)

        assert len(server.study_participants) == 0
        msgs = ws.get_sent_messages_of_type("no_games_available")
        assert len(msgs) == 1

        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    @pytest.mark.asyncio
    async def test_participant_dropout_removes_from_queue(
        self, clean_server_state, running_game_manager
    ):
        """Participant disconnecting before game start is removed from study_participants."""
        server.schedule.append(make_slot(num_humans=3))

        ws = MockWebSocket()
        ws.queue_message(make_study_join("Alice"))
        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.3)

        assert len(server.study_participants) == 1

        # Simulate disconnect
        ws.close()
        await asyncio.sleep(0.3)

        assert len(server.study_participants) == 0

        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    @pytest.mark.asyncio
    async def test_exit_queue_removes_participant(
        self, clean_server_state, running_game_manager
    ):
        """Participant sending exit_queue is removed from study_participants."""
        server.schedule.append(make_slot(num_humans=3))

        ws = MockWebSocket()
        ws.queue_message(make_study_join("Alice"))
        task = asyncio.create_task(server.websocket_endpoint(ws))
        await asyncio.sleep(0.3)

        assert len(server.study_participants) == 1

        ws.queue_message({"type": "exit_queue"})
        await asyncio.sleep(0.3)

        assert len(server.study_participants) == 0

        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


# ---------------------------------------------------------------------------
# Game assignment
# ---------------------------------------------------------------------------


class TestStudyGameAssignment:
    @pytest.mark.asyncio
    async def test_game_starts_when_enough_participants(
        self, clean_server_state, running_game_manager
    ):
        """Game fires when study_participants reaches num_humans."""
        server.schedule.append(make_slot(num_humans=2))

        ws1, ws2 = MockWebSocket(), MockWebSocket()
        ws1.queue_message(make_study_join("Alice", prolific_id="alice"))
        ws2.queue_message(make_study_join("Bob", prolific_id="bob"))

        t1 = asyncio.create_task(server.websocket_endpoint(ws1))
        t2 = asyncio.create_task(server.websocket_endpoint(ws2))

        # Wait for game_manager to fire the game
        elapsed = 0.0
        while elapsed < 4.0 and len(server.active_games) == 0:
            await asyncio.sleep(0.2)
            elapsed += 0.2

        assert len(server.active_games) == 1
        assert len(server.study_participants) == 0

        # Both players should have received new_round
        assert len(ws1.get_sent_messages_of_type("new_round")) == 1
        assert len(ws2.get_sent_messages_of_type("new_round")) == 1

        for t in (t1, t2):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass

    @pytest.mark.asyncio
    async def test_slot_consumed_after_game_starts(
        self, clean_server_state, running_game_manager
    ):
        """The slot is popped from the schedule once a game fires."""
        server.schedule.append(make_slot(num_humans=2))

        ws1, ws2 = MockWebSocket(), MockWebSocket()
        ws1.queue_message(make_study_join("Alice"))
        ws2.queue_message(make_study_join("Bob"))

        t1 = asyncio.create_task(server.websocket_endpoint(ws1))
        t2 = asyncio.create_task(server.websocket_endpoint(ws2))

        elapsed = 0.0
        while elapsed < 4.0 and len(server.active_games) == 0:
            await asyncio.sleep(0.2)
            elapsed += 0.2

        assert len(server.schedule) == 0

        for t in (t1, t2):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass

    @pytest.mark.asyncio
    async def test_dropout_before_threshold_delays_game(
        self, clean_server_state, running_game_manager
    ):
        """If a participant drops before the threshold is met, game does not start."""
        server.schedule.append(make_slot(num_humans=2))

        ws1 = MockWebSocket()
        ws1.queue_message(make_study_join("Alice"))
        t1 = asyncio.create_task(server.websocket_endpoint(ws1))
        await asyncio.sleep(0.3)

        # Alice drops out
        ws1.close()
        await asyncio.sleep(0.3)

        assert len(server.active_games) == 0
        assert len(server.study_participants) == 0

        t1.cancel()
        try:
            await t1
        except (asyncio.CancelledError, Exception):
            pass


# ---------------------------------------------------------------------------
# out_path tracking
# ---------------------------------------------------------------------------


class TestOutPathTracking:
    @pytest.mark.asyncio
    async def test_out_path_populated_after_game_starts(
        self, clean_server_state, running_game_manager, tmp_path
    ):
        """game_out_paths is populated when a study game starts (if out_dir is set)."""
        server.schedule.append(make_slot(num_humans=2, out_dir=tmp_path))

        ws1, ws2 = MockWebSocket(), MockWebSocket()
        ws1.queue_message(make_study_join("Alice"))
        ws2.queue_message(make_study_join("Bob"))

        t1 = asyncio.create_task(server.websocket_endpoint(ws1))
        t2 = asyncio.create_task(server.websocket_endpoint(ws2))

        elapsed = 0.0
        while elapsed < 4.0 and len(server.active_games) == 0:
            await asyncio.sleep(0.2)
            elapsed += 0.2

        assert len(server.active_games) == 1
        game_id = next(iter(server.active_games))
        assert game_id in server.game_out_paths
        assert server.game_out_paths[game_id] is not None

        for t in (t1, t2):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass

    @pytest.mark.asyncio
    async def test_out_path_cleaned_up_after_delay(
        self, clean_server_state, running_game_manager, tmp_path
    ):
        """game_out_paths entry is removed after OUT_PATH_CLEANUP_DELAY seconds."""
        original_delay = server.OUT_PATH_CLEANUP_DELAY
        server.OUT_PATH_CLEANUP_DELAY = 0
        original_grace = server.RECONNECT_GRACE_SECONDS
        server.RECONNECT_GRACE_SECONDS = 0.5

        try:
            server.schedule.append(make_slot(num_humans=2, out_dir=tmp_path))

            ws1, ws2 = MockWebSocket(), MockWebSocket()
            ws1.queue_message(make_study_join("Alice"))
            ws2.queue_message(make_study_join("Bob"))

            t1 = asyncio.create_task(server.websocket_endpoint(ws1))
            t2 = asyncio.create_task(server.websocket_endpoint(ws2))

            elapsed = 0.0
            while elapsed < 4.0 and len(server.active_games) == 0:
                await asyncio.sleep(0.2)
                elapsed += 0.2

            game_id = next(iter(server.active_games))

            # End the game by closing both connections
            ws1.close()
            ws2.close()

            # Wait for run_game's finally block to complete (game removed from active_games)
            elapsed = 0.0
            while elapsed < 3.0 and game_id in server.active_games:
                await asyncio.sleep(0.1)
                elapsed += 0.1

            # Now the cleanup task has been created with delay=0; yield to let it fire
            await asyncio.sleep(0.1)

            assert game_id not in server.game_out_paths

        finally:
            server.OUT_PATH_CLEANUP_DELAY = original_delay
            server.RECONNECT_GRACE_SECONDS = original_grace

        for t in (t1, t2):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass


# ---------------------------------------------------------------------------
# Survey saving
# ---------------------------------------------------------------------------


class TestSurveyEndpoint:
    @pytest.mark.asyncio
    async def test_survey_saved_to_game_players_folder(
        self, clean_server_state, tmp_path
    ):
        """Survey is saved to <out_path>/surveys/ when game_id is known."""
        game_id = "test-game-123"
        out_path = tmp_path / "game_20250101_test"
        out_path.mkdir()
        server.game_out_paths[game_id] = str(out_path)

        from fastapi.testclient import TestClient

        client = TestClient(server.app)
        response = client.post(
            "/api/survey",
            json={
                "prolific_id": "abc123",
                "game_id": game_id,
                "survey": {"myStrategy": "be sneaky"},
            },
        )

        assert response.status_code == 200
        saved = list((out_path / "surveys").glob("*.json"))
        assert len(saved) == 1
        data = json.loads(saved[0].read_text())
        assert data["prolific_id"] == "abc123"
        assert data["survey"]["myStrategy"] == "be sneaky"

    @pytest.mark.asyncio
    async def test_survey_falls_back_when_game_id_unknown(
        self, clean_server_state, tmp_path, monkeypatch
    ):
        """Survey falls back to game_data/surveys/ when game_id is not in game_out_paths."""
        fallback_dir = tmp_path / "game_data" / "surveys"
        monkeypatch.setattr(
            server,
            "Path",
            lambda *args: (
                Path(str(tmp_path / "game_data" / "surveys"))
                if args == (server.__file__,)
                else Path(*args)
            ),
        )

        # Simpler: just patch the surveys dir directly via the endpoint behaviour
        # by ensuring game_id is absent from game_out_paths
        from fastapi.testclient import TestClient

        import cheat.server as sv

        original_parent = Path(sv.__file__).parent.parent
        fallback = tmp_path / "game_data" / "surveys"
        fallback.mkdir(parents=True)

        # Monkeypatch __file__ parent so fallback path points to tmp_path
        original_file = sv.__file__
        sv.__file__ = str(tmp_path / "cheat" / "server.py")
        (tmp_path / "cheat").mkdir(exist_ok=True)

        try:
            client = TestClient(sv.app)
            response = client.post(
                "/api/survey",
                json={
                    "prolific_id": "xyz999",
                    "game_id": "unknown-game",
                    "survey": {"myStrategy": "trust everyone"},
                },
            )
            assert response.status_code == 200
            saved = list(fallback.glob("*.json"))
            assert len(saved) == 1
        finally:
            sv.__file__ = original_file


# ---------------------------------------------------------------------------
# Participant tracking DB
# ---------------------------------------------------------------------------


class TestParticipantDB:
    @pytest.mark.asyncio
    async def test_new_participant_created_on_first_post(self, clean_db):
        """First POST for a prolific_id creates a row with both flags false."""
        from fastapi.testclient import TestClient

        client = TestClient(server.app)
        response = client.post("/api/participant", json={"prolific_id": "p001"})
        assert response.status_code == 200
        data = response.json()
        assert data["tutorial_done"] is False
        assert data["game_assigned"] is False

    @pytest.mark.asyncio
    async def test_tutorial_done_flag_updated(self, clean_db):
        from fastapi.testclient import TestClient

        client = TestClient(server.app)
        client.post("/api/participant", json={"prolific_id": "p002"})
        response = client.post(
            "/api/participant", json={"prolific_id": "p002", "tutorial_done": True}
        )
        assert response.json()["tutorial_done"] is True
        assert response.json()["game_assigned"] is False

    @pytest.mark.asyncio
    async def test_game_assigned_flag_updated(self, clean_db):
        from fastapi.testclient import TestClient

        client = TestClient(server.app)
        client.post("/api/participant", json={"prolific_id": "p003"})
        client.post(
            "/api/participant", json={"prolific_id": "p003", "tutorial_done": True}
        )
        response = client.post(
            "/api/participant", json={"prolific_id": "p003", "game_assigned": True}
        )
        assert response.json()["tutorial_done"] is True
        assert response.json()["game_assigned"] is True

    @pytest.mark.asyncio
    async def test_idempotent_post(self, clean_db):
        """Posting the same prolific_id twice doesn't duplicate or reset."""
        from fastapi.testclient import TestClient

        client = TestClient(server.app)
        client.post(
            "/api/participant", json={"prolific_id": "p004", "tutorial_done": True}
        )
        response = client.post("/api/participant", json={"prolific_id": "p004"})
        assert response.json()["tutorial_done"] is True
