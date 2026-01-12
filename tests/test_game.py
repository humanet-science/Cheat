import sys
import os
import yaml
import pytest
from pathlib import Path
import asyncio
import logging
import json
from pathlib import Path

# Add the project root to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from cheat.bots import RandomBot
from cheat.game import CheatGame

def load_test_cases(filename):
    """Load test cases from YAML file"""
    test_file = Path(__file__).parent / "data" / filename
    with open(test_file, 'r') as f:
        data = yaml.safe_load(f)

    return data

# Fill up with bots
def setup_game(tmp_path, *, bot_config, game_config, **__):
    game_players=[]
    for i, bot in enumerate(bot_config):
        type = bot.pop('type')
        # TODO: automatic type allocation when we have more bots
        if type == 'RandomBot':
            game_players.append(RandomBot(
                id=i,
                **bot
            ))

    # Set up a new game. Each game maintains its own message queue
    game = CheatGame(
        players=game_players,
        **game_config,
        message_queue = asyncio.Queue(), # Set up a new queue
        out_dir=tmp_path
    )
    game.logger.setLevel(logging.ERROR)
    game.player_logger.setLevel(logging.ERROR)
    return game

class TestBasicGameFunctionality:
    """Test games run correctly"""

    @pytest.mark.asyncio
    async def test_all_cases(self, tmp_path):
        """Test all test cases from YAML"""
        test_cases = load_test_cases("test_game.yaml")

        for k, v in test_cases.items():
            for test_case in v:
                game = setup_game(tmp_path, **test_case)
                for i in range(test_case['n_rounds']):
                   await game.play_round(sleep_pause=0)
                   assert game.winner is not None
                   game.new_round()


                # Check the json file is the same length as the game history
                json_file = Path(game.out_path) / "game_history.jsonl"
                with open(json_file, "r") as f:
                    game_history = [json.loads(line) for line in f if line.strip()]
                assert len(game_history) == len(game.history) + 1 # Additional player info line written at start of new game


