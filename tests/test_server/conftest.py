import asyncio
import os
import sys

import pytest

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), ".."), "..")),
)

import cheat.server as server


@pytest.fixture(scope="function")
def clean_server_state():
    """Fixture to ensure clean server state before and after tests."""
    # Before test: clear state
    server.active_games.clear()
    server.waiting_games.clear()
    server.player_to_game.clear()
    server.game_creators.clear()
    for num_players in server.waiting_queues:
        for mode in server.waiting_queues[num_players]:
            server.waiting_queues[num_players][mode].clear()

    yield

    # After test: clear state again
    server.active_games.clear()
    server.waiting_games.clear()
    server.player_to_game.clear()
    server.game_creators.clear()
    for num_players in server.waiting_queues:
        for mode in server.waiting_queues[num_players]:
            server.waiting_queues[num_players][mode].clear()


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
