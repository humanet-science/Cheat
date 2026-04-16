import asyncio
import os
import sys
from collections import deque

import pytest

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), ".."), "..")),
)

import cheat.server as server


def _clear_server_state():
    server.active_games.clear()
    server.waiting_games.clear()
    server.waiting_game_created_at.clear()
    server.player_to_game.clear()
    server.game_creators.clear()
    server.game_out_paths.clear()
    server.study_participants.clear()
    server.schedule.clear()
    for num_players in server.waiting_queues:
        for mode in server.waiting_queues[num_players]:
            server.waiting_queues[num_players][mode].clear()


@pytest.fixture(scope="function")
def clean_server_state(tmp_path):
    """Fixture to ensure clean server state before and after each test."""
    _clear_server_state()
    # Redirect DB to a writable temp path and initialise it. TestClient-based tests
    # may not trigger the lifespan (and thus init_db), so we do it explicitly here.
    original_db_path = server.DB_PATH
    server.DB_PATH = tmp_path / "participants_test.db"
    asyncio.run(server.init_db())
    yield
    _clear_server_state()
    server.DB_PATH = original_db_path


@pytest.fixture(scope="function")
async def clean_db(tmp_path):
    """Fixture that points the participant DB at a fresh temp file and initialises it."""
    original_path = server.DB_PATH
    server.DB_PATH = tmp_path / "participants_test.db"
    await server.init_db()
    yield
    server.DB_PATH = original_path


@pytest.fixture(scope="function")
async def running_game_manager():
    """Fixture that ensures game_manager is running during tests."""
    manager_task = None

    # Start game manager if not already running
    if server.game_manager_task is None or server.game_manager_task.done():
        manager_task = asyncio.create_task(server.game_manager())
        await asyncio.sleep(0.1)  # Let it start

    yield

    # Clean up if we started it
    if manager_task and not manager_task.done():
        manager_task.cancel()
        try:
            await manager_task
        except asyncio.CancelledError:
            pass
