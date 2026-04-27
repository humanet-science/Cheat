import asyncio
import logging
import yaml
import os

from cheat.game import CheatGame
from cheat.player import get_player
from cheat.bots.LLM import LLM_Player

""" General utility functions"""


def game_from_config(config: dict, *, show_logs: bool = False) -> CheatGame:
    """Sets up a new CheatGame instance from a configuration file

    :param config: configuration dictionary, containing player and game settings. The player config may also contain
        'Player' instances
    :param show_logs: optional flag to silence the console logs
    :return: initialised game instance
    """

    # Game players from the config
    game_players = []
    for idx, player_config in enumerate(config["players"]):
        if isinstance(player_config, dict):
            game_players.append(get_player(**player_config))
        else:
            # Player_config is actually an initialised player
            game_players.append(player_config)

        # Set the player id, if not already done
        if game_players[-1].id is None:
            game_players[-1].id = idx

    # Add players
    game = CheatGame(
        players=game_players,
        message_queue=asyncio.Queue(),  # Set up a new queue: each game maintains its own queue
        predefined_messages=config.get("predefined_messages", [])
        if config["game"].get("experimental_mode", False)
        else [],
        timeout=config.get("timeout"),
        **config["game"]
    )

    # Set the system prompt for all LLM players, if not specified from the config
    for i, player in enumerate(game.players):
        # Format the LLM default prompt
        if isinstance(player, LLM_Player):
            if player.system_prompt is None:
                player.system_prompt = config["default_system_prompt"].format(
                    N_players=game.num_players,
                    player_id=player.id,
                    player_id_before=(player.id - 1) % game.num_players,
                    player_id_after=(player.id + 1) % game.num_players,
                )

    # Turn off logging, if specified
    if not show_logs:
        game.logger.setLevel(logging.WARN)
        game.player_logger.setLevel(logging.WARN)

    return game
