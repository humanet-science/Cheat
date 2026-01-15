import asyncio
import logging

from cheat.game import CheatGame
from cheat.player import get_player


""" General utility functions"""

def game_from_config(config: dict, *, show_logs: bool = False) -> CheatGame:
    """ Sets up a new CheatGame instance from a configuration file

    :param config: configuration dictionary, containing player and game settings. The player config may also contain
        'Player' instances
    :param show_logs: optional flag to silence the console logs
    :return: initialised game instance
    """

    # Game players from the config
    game_players=[]
    for player_config in config['players']:
        if isinstance(player_config, dict):
            game_players.append(get_player(**player_config))
        else:
            # Player_config is actually an initialised player
            game_players.append(player_config)

    # Add players
    game = CheatGame(
        players=game_players,
        message_queue=asyncio.Queue(),  # Set up a new queue: each game maintains its own queue
        predefined_messages=config['experiment'].get('predefined_messages', []) if config['game'].get('experimental_mode', False) else [],
        **config['game']
    )

    # Turn off logging, if specified
    if not show_logs:
        game.logger.setLevel(logging.WARN)
        game.player_logger.setLevel(logging.WARN)

    return game