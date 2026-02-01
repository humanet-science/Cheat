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

from cheat.utils import game_from_config

def load_test_cases(filename):
    """Load test cases from YAML file"""
    test_file = Path(__file__).parent / "data" / filename
    with open(test_file, 'r') as f:
        data = yaml.safe_load(f)

    return data

class TestBasicGameFunctionality:
    """Test games run correctly"""

    @pytest.mark.asyncio
    async def test_all_cases(self, tmp_path):
        """Test all test cases from YAML"""
        test_cases = load_test_cases("test_game.yaml")

        for k, v in test_cases.items():
            for test_case in v:
                test_case['game_config']['game']['out_dir'] = tmp_path

                game = game_from_config(test_case['game_config'])

                for i in range(test_case['n_rounds']):
                   await game.play_round(sleep_pause=0)
                   assert game.winner is not None
                   game.new_round()

                # Check the json file is the same length as the game history
                json_file = Path(game.out_path) / "game_history.jsonl"
                with open(json_file, "r") as f:
                    game_history = [json.loads(line) for line in f if line.strip()]
                assert len(game_history) == len(game.history) + 1 # Additional player info line written at start of new game
