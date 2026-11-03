import asyncio
import logging
import os

import yaml

from cheat.bots.LLM import LLM_Player
from cheat.game import CheatGame
from cheat.player import get_player

""" General utility functions"""


def silence_console_logs(game: CheatGame) -> None:
    """Raise the level of a game's console log handlers so INFO-level game/player
    messages are suppressed there, while file logging (game.log) is unaffected."""
    for logger in (game.logger, game.player_logger):
        for handler in logger.handlers:
            if not isinstance(handler, logging.FileHandler):
                handler.setLevel(logging.WARN)


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

            # Convert the config entry back to a dictionary so we can store it
            config["players"][idx] = player_config.__dict__()

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

    # Turn off console logging, if specified (file logging is unaffected)
    if not show_logs:
        silence_console_logs(game)

    # Write metadata to folder
    if game.out_path is not None:
        file_path = os.path.join(game.out_path, "game_config.yaml")
        with open(file_path, "w") as f:
            yaml.dump(config, f)

    return game
