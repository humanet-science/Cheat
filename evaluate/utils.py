import asyncio
import logging

from cheat.game import CheatGame
from cheat.player import get_player

""" General utility functions for experiment scripts"""


def setup_game(
    config: dict, *, out_dir: str = None, note: str = None, show_logs: bool = False
):
    """Set up a game instance"""

    # Game players from the config
    game_players = []
    for p in config["players"]:
        game_players.append(get_player(p))

    # Add players
    game = CheatGame(
        players=game_players,
        experimental_mode=False,
        game_mode="single",
        message_queue=asyncio.Queue(),  # Set up a new queue: each game maintains its own queue
        out_dir=out_dir,
        note=note,
    )

    # Turn off logging
    if not show_logs:
        game.logger.setLevel(logging.WARN)
        game.player_logger.setLevel(logging.WARN)

    return game
