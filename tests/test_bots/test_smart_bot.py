"""
Comprehensive tests for the SmartBot player.
Tests tracking, strategy, decision-making, and messaging behaviour.
"""

import os

# Add the project root to Python path
import sys

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), ".."), "..")),
)

import pytest

from cheat.bots import SmartBot
from cheat.card import Card
from tests.utils import MockGame


class TestSmartBotInitialization:
    """Test SmartBot initialization and basic properties."""

    def test_initialization(self):
        """Test bot initializes with correct defaults."""
        bot = SmartBot(id=0, name="TestBot", avatar="avatar1", verbosity=0.5)

        assert bot.id == 0
        assert bot.name == "TestBot"
        assert bot.avatar == "avatar1"
        assert bot.type == "bot"
        assert bot.verbosity == 0.5
        assert bot.other_player_repr == {}
        assert bot.last_action_idx == 0
        assert bot.other_player_repr_hist == {}

    def test_dict_method(self):
        """Test __dict__ returns correct representation."""
        bot = SmartBot(id=1, name="Bot1", avatar="av1", verbosity=0.3)

        bot_dict = bot.__dict__()

        assert bot_dict["id"] == 1
        assert bot_dict["name"] == "Bot1"
        assert bot_dict["avatar"] == "av1"
        assert bot_dict["type"] == "bot"
        assert bot_dict["verbosity"] == 0.3


class TestPlayerTracking:
    """Test SmartBot's ability to track other players' behavior."""

    def test_populate_player_repr_from_calls(self):
        """Test that bot tracks calls and lie probability."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Player 1 plays, Player 2 calls and catches them lying
        game.add_play_action(1, "K", [Card("K", "♠"), Card("Q", "♥")])
        game.add_call_action(
            2, 1, was_lying=True, revealed_cards=[Card("K", "♠"), Card("Q", "♥")]
        )

        bot.populate_player_repr(game)

        # Check Player 1's stats
        assert bot.other_player_repr[1]["N_lies"] == 1
        assert bot.other_player_repr[1]["N_plays_called"] == 1
        assert bot.other_player_repr[1]["p_lie_est"] == 1.0

        # Check Player 2's stats
        assert bot.other_player_repr[2]["N_calls"] == 1

        # Check known cards for Player 1
        assert len(bot.other_player_repr[1]["known_cards"]) == 2

    def test_populate_player_repr_honest_play(self):
        """Test tracking when a call fails (player was honest)."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Player 1 plays honestly, Player 2 calls but was wrong
        game.add_play_action(1, "K", [Card("K", "♠"), Card("K", "♥")])
        game.add_call_action(
            2, 1, was_lying=False, revealed_cards=[Card("K", "♠"), Card("K", "♥")]
        )

        bot.populate_player_repr(game)

        # Player 1 was honest
        assert bot.other_player_repr[1]["N_lies"] == 0
        assert bot.other_player_repr[1]["N_plays_called"] == 1
        assert bot.other_player_repr[1]["p_lie_est"] == 0.0

        # Bot should know Player 2's cards (they picked up the pile)
        assert len(bot.other_player_repr[2]["known_cards"]) == 2

    def test_track_play_probability(self):
        """Test tracking of play vs call probability."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Play two rounds
        game.add_play_action(1, "K", [Card("K", "♠")])  # forced play
        game.add_play_action(2, "K", [Card("Q", "♥")])  # unforced play
        game.add_call_action(3, 2, True, revealed_cards=[Card("Q", "♥")])
        game.add_play_action(3, "10", [Card("10", "♥")])  # forced play
        game.add_play_action(0, "10", [Card("9", "♥")])  # unforced play
        game.add_play_action(1, "10", [Card("8", "♥")])  # unforced play
        game.add_call_action(2, 1, True, revealed_cards=[Card("8", "♥")])
        game.add_play_action(2, "J", [Card("2", "♥")])  # forced play
        game.add_play_action(3, "J", [Card("A", "♥")])  # unforced play

        bot.populate_player_repr(game)

        assert bot.other_player_repr[1]["N_plays"] == 1
        assert bot.other_player_repr[1]["N_calls"] == 0
        assert bot.other_player_repr[1]["p_call_est"] == 0
        assert bot.other_player_repr[1]["p_lie_est"] == 1

        assert bot.other_player_repr[2]["N_plays"] == 1
        assert bot.other_player_repr[2]["N_calls"] == 1
        assert bot.other_player_repr[2]["p_call_est"] == 1 / 2
        assert bot.other_player_repr[2]["p_lie_est"] == 1

        assert bot.other_player_repr[3]["N_plays"] == 1
        assert bot.other_player_repr[3]["N_calls"] == 1
        assert bot.other_player_repr[3]["p_call_est"] == 1 / 2

    def test_known_cards_cleared_each_round(self):
        """Test that known cards are cleared on each populate call."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # First round
        game.add_play_action(1, "K", [Card("K", "♠")])
        game.add_call_action(2, 1, was_lying=True, revealed_cards=[Card("K", "♠")])

        bot.populate_player_repr(game)
        assert len(bot.other_player_repr[1]["known_cards"]) == 1

        # Second call with different cards
        game.add_play_action(1, "Q", [Card("Q", "♠")])
        game.add_call_action(2, 1, was_lying=True, revealed_cards=[Card("Q", "♠")])

        bot.populate_player_repr(game)

        # Known cards should be only from the latest call
        assert len(bot.other_player_repr[1]["known_cards"]) == 1
        assert bot.other_player_repr[1]["known_cards"][0].rank == "Q"


class TestDecisionMaking:
    """Test SmartBot's decision-making logic."""

    @pytest.mark.asyncio
    async def test_call_when_previous_player_has_few_cards(self):
        """Test that bot increases call probability when previous player has few cards."""
        bot = SmartBot(id=1, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Previous player (id=0) has only 2 cards
        game.players[0].hand = [Card("K", "♠"), Card("Q", "♥")]

        # There's something on the pile
        game.pile = [Card("J", "♣")]
        game.current_rank = "K"

        bot.hand = [Card("K", "♠"), Card("K", "♥"), Card("Q", "♣")]

        # Run multiple times to check increased probability
        calls = 0
        for _ in range(20):
            bot.last_action_idx = 0  # Reset
            bot.other_player_repr = {}
            action = await bot.make_move(game)
            if action.type == "call":
                calls += 1

        # With 2 cards, should call more often (probability boosted)
        assert calls > 5, f"Expected more calls with low-card player, got {calls}/20"

    @pytest.mark.asyncio
    async def test_must_call_when_previous_player_has_no_cards(self):
        """Test that bot always calls when previous player has 0 cards."""
        bot = SmartBot(id=1, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Previous player has no cards
        game.players[0].hand = []
        game.pile = [Card("J", "♣")]
        game.current_rank = "K"

        bot.hand = [Card("K", "♠")]

        action = await bot.make_move(game)

        assert action.type == "call", "Bot must call when previous player has 0 cards"

    @pytest.mark.asyncio
    async def test_decrease_lying_when_nearby_player_low_on_cards(self):
        """Test that bot decreases lying probability when nearby players are low on cards."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Next player (id=1) has only 2 cards
        game.players[1].hand = [Card("K", "♠"), Card("Q", "♥")]

        # Bot has cards but not the target rank
        bot.hand = [Card("J", "♠"), Card("J", "♥"), Card("Q", "♣"), Card("Q", "♦")]
        game.current_rank = None
        game.pile = []
        game.discarded_ranks = []

        # Run multiple times
        lies = 0
        for _ in range(50):
            bot.last_action_idx = 0
            bot.other_player_repr = {}
            action = await bot.make_move(game)

            if action.type == "play":
                declared = action.data["declared_rank"]
                played = action.data["cards_played"]
                # Check if lying
                if any(c.rank != declared for c in played):
                    lies += 1

        # Should lie less often when next player is low on cards
        assert (
            lies < 30
        ), f"Bot should lie less with low-card player nearby, got {lies}/50 lies"

    @pytest.mark.asyncio
    async def test_avoids_known_ranks_when_starting_new_round(self):
        """Test that bot avoids leading with ranks known to be in low-card players' hands."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=3)

        # Player 1 (nearby) has 2 cards, and bot knows they have Kings
        game.players[1].hand = [Card("K", "♠"), Card("K", "♥")]

        # Simulate that bot learned Player 1 has Kings
        game.add_play_action(1, "Q", [Card("K", "♠"), Card("K", "♥")])
        game.add_call_action(
            2, 1, was_lying=True, revealed_cards=[Card("K", "♠"), Card("K", "♥")]
        )
        game.add_play_action(2, "10", [Card("A", "♠")])
        game.add_call_action(0, 2, was_lying=True, revealed_cards=[Card("A", "♠")])

        # Bot has Kings
        bot.hand = [Card("K", "♣"), Card("K", "♦"), Card("9", "♠"), Card("Q", "♥")]
        game.current_rank = None
        game.pile = []
        game.discarded_ranks = []

        # Bot should never lead with Kings
        action = await bot.make_move(game)
        assert action.type == "play"
        assert action.data["declared_rank"] != "K"

    @pytest.mark.asyncio
    async def test_prefers_truth_when_holding_current_rank(self):
        """Test that bot prefers to play truthfully when holding the current rank."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)
        game.deal_cards()

        game.current_rank = "K"
        game.pile = [Card("J", "♣")]

        # Bot has Kings
        bot.hand = [Card("K", "♠"), Card("K", "♥"), Card("Q", "♣"), Card("Q", "♦")]

        # Run multiple times: probability of telling truth should be around 75%
        truthful_plays = 0
        total_plays = 0
        for _ in range(10000):
            bot.last_action_idx = 0
            bot.other_player_repr = {}
            action = await bot.make_move(game)

            if action.type == "play":
                total_plays += 1
                played = action.data["cards_played"]
                # Check if playing truthfully
                if all(c.rank == "K" for c in played):
                    truthful_plays += 1

        # Should play truthfully most of the time when holding the rank
        print(truthful_plays / total_plays)
        assert truthful_plays / total_plays == pytest.approx(
            0.75, abs=0.02
        ), f"Bot should prefer be truthful 75% of the time, played truthfully {truthful_plays}/{total_plays} times"

    @pytest.mark.asyncio
    async def test_adjusts_to_aggressive_caller(self):
        """Test that bot reduces lying when next player calls frequently."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Simulate that Player 1 (next player) calls frequently
        for _ in range(5):
            game.add_play_action(2, "K", [Card("K", "♠")])
            game.add_call_action(1, 2, was_lying=True, revealed_cards=[Card("K", "♠")])

        for _ in range(2):
            game.add_play_action(2, "Q", [Card("Q", "♠")])
            # Player 1 doesn't call

        bot.populate_player_repr(game)

        # Player 1's call probability should be high
        assert bot.other_player_repr[1]["p_call_est"] == 1

        # Bot should lie less
        bot.hand = [Card("J", "♠"), Card("J", "♥"), Card("Q", "♣")]
        game.current_rank = None
        game.pile = []
        game.discarded_ranks = []

        lies = 0
        for _ in range(30):
            action = await bot.make_move(game)
            if action.type == "play":
                declared = action.data["declared_rank"]
                played = action.data["cards_played"]
                if any(c.rank != declared for c in played):
                    lies += 1

        # Should lie less when next player is aggressive
        assert (
            lies < 20
        ), f"Bot should lie less with aggressive caller, lied {lies}/30 times"

    @pytest.mark.asyncio
    async def test_plays_aces_when_lying(self):
        """Test that bot prefers to play Aces when lying."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        game.current_rank = "K"
        game.pile = [Card("J", "♣")]

        # Bot has no Kings, but has Aces
        bot.hand = [Card("A", "♠"), Card("A", "♥"), Card("Q", "♣"), Card("Q", "♦")]

        # Set up so bot will lie
        bot.other_player_repr[1] = {"p_call_est": 0.1}  # Low call probability

        aces_played = 0
        total_plays = 0
        for _ in range(1000):
            bot.last_action_idx = len(game.history)
            action = await bot.make_move(game)

            if action.type == "play":
                total_plays += 1
                played = action.data["cards_played"]
                # Check if Aces were played
                if any(c.rank == "A" for c in played):
                    aces_played += 1

        # Should prefer Aces when lying
        assert (
            aces_played / total_plays == 1
        ), f"Bot should prefer playing Aces when lying, played Aces {aces_played}/{total_plays} times"

    @pytest.mark.asyncio
    async def test_adjusts_cards_played_based_on_call_probability(self):
        """Test that bot plays fewer cards when call probability is high."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        game.current_rank = "K"
        game.pile = [Card("J", "♣")]

        # Bot has no Kings
        bot.hand = [Card("Q", "♠"), Card("Q", "♥"), Card("Q", "♣"), Card("Q", "♦")]

        # High call probability
        bot.other_player_repr[1] = {"p_call_est": 0.8}

        cards_counts = []
        for _ in range(20):
            bot.last_action_idx = len(game.history)
            action = await bot.make_move(game)

            if action.type == "play":
                cards_counts.append(len(action.data["cards_played"]))

        avg_cards = sum(cards_counts) / len(cards_counts)

        # Should play fewer cards on average with high call probability
        assert (
            avg_cards < 2.0
        ), f"Bot should play fewer cards with high call probability, avg={avg_cards}"


class TestMessaging:
    """Test SmartBot's message generation."""

    def test_respects_verbosity_zero(self):
        """Test that bot with 0 verbosity stays silent."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
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
        bot = SmartBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        game.current_rank = None

        msg = bot.broadcast_message(game, type="thinking")

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_caught_lying_large_pile(self):
        """Test message when bot is caught lying and picks up large pile."""
        bot = SmartBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Bot (id=0) plays and gets caught
        game.add_play_action(0, "K", [Card("Q", "♠"), Card("Q", "♥")])
        game.pile = [Card("J", "♣"), Card("J", "♦"), Card("10", "♠"), Card("10", "♥")]
        game.add_call_action(
            1, 0, was_lying=True, revealed_cards=[Card("Q", "♠"), Card("Q", "♥")]
        )

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_caught_lying_small_pile(self):
        """Test message when bot picks up only their own cards."""
        bot = SmartBot(id=0, name="Bot", verbosity=1.0)
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
        bot = SmartBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays, bot calls and catches them
        game.add_play_action(1, "K", [Card("Q", "♠")])
        game.add_call_action(0, 1, was_lying=True, revealed_cards=[Card("Q", "♠")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_failed_call(self):
        """Test message when bot fails to catch someone (they were honest)."""
        bot = SmartBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays honestly, bot calls and is wrong
        game.add_play_action(1, "K", [Card("K", "♠")])
        game.add_call_action(0, 1, was_lying=False, revealed_cards=[Card("K", "♠")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_when_someone_else_caught_lying(self):
        """Test taunt message when another player is caught lying."""
        bot = SmartBot(id=0, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays, Player 2 catches them lying (bot not involved)
        game.add_play_action(1, "K", [Card("Q", "♠")])
        game.add_call_action(2, 1, was_lying=True, revealed_cards=[Card("Q", "♠")])

        msg = bot.broadcast_message(game)

        assert msg is not None
        assert isinstance(msg, str)

    def test_message_after_suspicious_play(self):
        """Test message after someone else plays (expressing suspicion)."""
        bot = SmartBot(id=0, name="Bot", verbosity=1.0)
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
        bot = SmartBot(id=2, name="Bot", verbosity=1.0)
        game = MockGame(num_players=4)

        # Player 1 plays, bot is next (id=2)
        game.add_play_action(1, "K", [Card("K", "♠")])

        msg = bot.broadcast_message(game)

        # Should return None when it's their turn next
        assert msg is None
