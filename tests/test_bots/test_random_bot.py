"""
Comprehensive tests for the RandomBot player.
"""

# Add the project root to Python path
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), '..'), '..')))

import pytest

from cheat.bots import RandomBot
from cheat.card import Card
from tests.utils import MockGame

class TestRandomBotInitialization:
    """Test RandomBot initialization and basic properties."""

    def test_initialization(self):
        """Test bot initializes with correct defaults."""
        bot = RandomBot(id=0, name="TestBot", avatar="avatar1", verbosity=0.5, p_call=0.5, p_lie=0.5)

        assert bot.id == 0
        assert bot.name == "TestBot"
        assert bot.avatar == "avatar1"
        assert bot.type == "bot"
        assert bot.verbosity == 0.5
        assert bot.p_lie == 0.5
        assert bot.p_call == 0.5

    def test_dict_method(self):
        """Test __dict__ returns correct representation."""
        bot = RandomBot(id=1, name="Bot1", avatar="av1", verbosity=0.3, p_lie=0.5, p_call=0.5)

        bot_dict = bot.__dict__()

        assert bot_dict["id"] == 1
        assert bot_dict["name"] == "Bot1"
        assert bot_dict["avatar"] == "av1"
        assert bot_dict["type"] == "bot"
        assert bot_dict["verbosity"] == 0.3

class TestDecisionMaking:
    """Test RandomBot's decision-making logic."""

    @pytest.mark.asyncio
    async def test_must_call_when_previous_player_has_no_cards(self):
        """Test that bot always calls when previous player has 0 cards."""
        bot = RandomBot(id=1, name="Bot", verbosity=0.0, p_lie=0, p_call=0)
        game = MockGame(num_players=4)

        # Previous player has no cards
        game.add_play_action(0, declared_rank="K", cards=[Card("J", "♣")])
        game.players[0].hand = []
        game.pile = [Card("J", "♣")]
        game.current_rank = "K"

        bot.hand = [Card("K", "♠")]

        action = await bot.choose_action(game)

        assert action.type == "call", "Bot must call when previous player has 0 cards"


class TestMessaging:
    """Test RandomBot's message generation."""

    def test_respects_verbosity_zero(self):
        """Test that bot with 0 verbosity stays silent."""
        bot = RandomBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Add some history
        game.add_play_action(1, "K", [Card("K", "♠")])

        messages = []
        for _ in range(50):
            msg = bot.broadcast_message(game)
            if msg:
                messages.append(msg)

        # Should rarely or never speak with 0 verbosity
        assert len(messages) < 5, f"Bot with 0 verbosity spoke {len(messages)} times"

    def test_thinking_message_for_new_play(self):
        """Test that bot can generate thinking message for new play."""
        bot = RandomBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        game.current_rank = None

        msg = bot.broadcast_message(game, type="thinking")

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_caught_lying_large_pile(self):
        """Test message when bot is caught lying and picks up large pile."""
        bot = RandomBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Bot (id=0) plays and gets caught
        game.add_play_action(0, "K", [Card("Q", "♠"), Card("Q", "♥")])
        game.pile = [Card("J", "♣"), Card("J", "♦"), Card("10", "♠"), Card("10", "♥")]
        game.add_call_action(1, 0, was_lying=True,
                             revealed_cards=[Card("Q", "♠"), Card("Q", "♥")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_caught_lying_small_pile(self):
        """Test message when bot picks up only their own cards."""
        bot = RandomBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Bot plays and gets caught with small pile
        game.add_play_action(0, "K", [Card("Q", "♠")])
        game.pile = [Card("Q", "♠")]
        game.add_call_action(1, 0, was_lying=True, revealed_cards=[Card("Q", "♠")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_successful_call(self):
        """Test message when bot successfully catches someone lying."""
        bot = RandomBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays, bot calls and catches them
        game.add_play_action(1, "K", [Card("Q", "♠")])
        game.add_call_action(0, 1, was_lying=True, revealed_cards=[Card("Q", "♠")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_failed_call(self):
        """Test message when bot fails to catch someone (they were honest)."""
        bot = RandomBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays honestly, bot calls and is wrong
        game.add_play_action(1, "K", [Card("K", "♠")])
        game.add_call_action(0, 1, was_lying=False, revealed_cards=[Card("K", "♠")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_someone_else_caught_lying(self):
        """Test taunt message when another player is caught lying."""
        bot = RandomBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays, Player 2 catches them lying (bot not involved)
        game.add_play_action(1, "K", [Card("Q", "♠")])
        game.add_call_action(2, 1, was_lying=True, revealed_cards=[Card("Q", "♠")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_after_suspicious_play(self):
        """Test message after someone else plays (expressing suspicion)."""
        bot = RandomBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays (not bot's turn next)
        game.players[0].id = 0
        game.players[1].id = 1
        game.players[2].id = 2
        bot.id = 0

        game.add_play_action(1, "K", [Card("K", "♠")])

        msg = bot.broadcast_message(game)

        # Might or might not comment based on whether it's their turn next
        # Just verify it doesn't crash
        assert msg is None or isinstance(msg, str)

    def test_silence_when_turn_is_next(self):
        """Test that bot stays silent after a play when it's their turn next."""
        bot = RandomBot(id=2, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays, bot is next (id=2)
        game.add_play_action(1, "K", [Card("K", "♠")])

        msg = bot.broadcast_message(game)

        # Should return None when it's their turn next
        assert msg is None