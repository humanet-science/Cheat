import ast
import os
import sys
from pathlib import Path

import pytest
import yaml

# Add the project root to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from cheat.action import GameAction
from cheat.bots import RandomBot
from cheat.bots.LLM import convert_LLM_response, is_valid_move
from cheat.card import str_to_Card
from cheat.game import CheatGame


def load_test_cases(filename):
    """Load test cases from YAML file"""
    test_file = Path(__file__).parent / "data" / filename
    with open(test_file) as f:
        data = yaml.safe_load(f)

    # Convert string tuples to actual tuples using ast.literal_eval for safe evaluation
    for key in data.keys():
        for test_case in data.get(key, []):
            if isinstance(test_case.get("expected", None), str):
                test_case["expected"] = ast.literal_eval(test_case["expected"])
            if isinstance(test_case.get("move", None), str):
                test_case["move"] = ast.literal_eval(test_case["move"])

    return data


class TestConvertLLMResponseYAML:
    """Test LLM response patterns are correctly extracted"""

    @pytest.fixture
    def cheat_game(self):
        """Create a CheatGame instance for testing"""
        return CheatGame(players=[RandomBot(), RandomBot()])

    def test_all_cases(self, cheat_game):
        """Test all test cases from YAML"""
        test_cases = load_test_cases("test_convert_llm_response.yaml")

        for k, v in test_cases.items():
            for test_case in v:
                # Set up game state if specified
                cheat_game.current_rank = test_case.get("current_rank", None)

                # Run the conversion
                result = convert_LLM_response(cheat_game, test_case["input"])

                # Compare with expected result
                # Convert expected list to tuple and create Card objects
                expected_list = test_case["expected"]
                if expected_list[0] == "play":
                    # Convert card strings to Card objects
                    card_strings = expected_list[2]
                    card_objects = [str_to_Card(card_str) for card_str in card_strings]
                    expected = GameAction(
                        type="play",
                        data=dict(
                            declared_rank=expected_list[1], cards_played=card_objects
                        ),
                    )
                else:
                    expected = GameAction(type=expected_list[0], data={})

                assert (
                    result == expected
                ), f"Failed test: {test_case.get('name', 'unnamed')}"


class TestCheckLLMMoves:
    """Test LLM moves are valid"""

    @pytest.fixture
    def cheat_game(self):
        """Create a CheatGame instance for testing"""
        return CheatGame(players=[RandomBot(), RandomBot()])

    def test_all_cases(self, cheat_game):
        """Test all test cases from YAML"""
        test_cases = load_test_cases("test_llm_move_checker.yaml")

        for k, v in test_cases.items():
            for test_case in v:
                # Set up game state if specified
                cheat_game.current_rank = test_case.get("current_rank", None)
                hand = test_case.get("hand", [])
                hand = [str_to_Card(s) for s in hand]

                # Run the conversion
                if test_case["move"][0] == "call":
                    move = GameAction(type="call")
                else:
                    move = GameAction(
                        type=test_case["move"][0],
                        data=dict(
                            declared_rank=test_case["move"][2],
                            cards_played=[str_to_Card(s) for s in test_case["move"][1]],
                        ),
                    )

                if k == "pass_cases":
                    assert is_valid_move(move, cheat_game, hand)[0]
                else:
                    res = is_valid_move(move, cheat_game, hand)
                    assert not res[0]
                    match_str = test_case["match_str"]
                    assert match_str in res[1]
