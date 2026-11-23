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
        """Test that the bot prefers calling when the previous player has very few cards.

        When the bot can't play honestly and a successful call would make the close-to-winning
        player pick up the pile, calling dominates lying in expected position. A successful
        call lets the bot shed 4 Queens immediately; a failed call adds only 1 pile card.
        """
        bot = SmartBot(id=1, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Previous player (id=0) is close to winning with 2 cards
        game.players[0].hand = [Card("K", "♠"), Card("Q", "♥")]
        # Set all players to moderate card counts so position estimates are meaningful
        game.players[1].hand = [
            Card("Q", "♣"),
            Card("Q", "♦"),
            Card("Q", "♥"),
            Card("Q", "♠"),
            Card("J", "♣"),
        ]
        game.players[2].hand = [
            Card("K", "♠"),
            Card("K", "♥"),
            Card("K", "♣"),
            Card("K", "♦"),
            Card("J", "♠"),
        ]
        game.players[3].hand = [
            Card("A", "♠"),
            Card("A", "♥"),
            Card("9", "♣"),
            Card("9", "♦"),
            Card("8", "♠"),
        ]

        # Bot has no Kings — cannot play honestly, must lie or call
        bot.hand = [
            Card("Q", "♣"),
            Card("Q", "♦"),
            Card("Q", "♥"),
            Card("Q", "♠"),
            Card("J", "♣"),
        ]

        # Add a play action so last_play() returns valid data for the call evaluation
        game.add_play_action(0, "K", [Card("K", "♠")])
        game.pile = [Card("J", "♣")]
        game.current_rank = "K"

        calls = 0
        for _ in range(20):
            bot.last_action_idx = 0
            bot.other_player_repr = {}
            action = await bot.make_move(game)
            if action.type == "call":
                calls += 1

        # Call success sheds 4 Queens (best possible) at the cost of a small pile if wrong;
        # position math favours calling roughly 2/3 of the time.
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

        # Bot has J×2 and Q×2; can always play honestly
        bot.hand = [Card("J", "♠"), Card("J", "♥"), Card("Q", "♣"), Card("Q", "♦")]
        # Sync game.players[0].hand so position estimates reflect the bot's real hand.
        # Without this, estimate_position uses the ~13-card MockGame hand and treats
        # honest play and lying as equally costly (both give rank 2nd).
        game.players[0].hand = list(bot.hand)
        # Next player (id=1) has only 2 cards — being called lets them shed to 1
        game.players[1].hand = [Card("K", "♠"), Card("Q", "♥")]
        game.current_rank = None
        game.pile = []
        game.discarded_ranks = []

        # With the corrected hand sizes, honest play gives rank 1 (bot at 2 cards,
        # tied with player1) while lying gives rank 2 (bot stays at 3–4 cards).
        # The bot should almost never lie.
        lies = 0
        for _ in range(50):
            bot.last_action_idx = 0
            bot.other_player_repr = {}
            action = await bot.make_move(game)

            if action.type == "play":
                declared = action.data["declared_rank"]
                played = action.data["cards_played"]
                if any(c.rank != declared for c in played):
                    lies += 1

        assert (
            lies < 10
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

        # Populate player repr so the bot knows player 1 holds Kings
        bot.populate_player_repr(game)

        # Bot should never lead with Kings
        action = await bot.make_move(game)
        assert action.type == "play"
        assert action.data["declared_rank"] != "K"

    @pytest.mark.asyncio
    async def test_prefers_truth_when_holding_current_rank(self):
        """Test that bot prefers to play truthfully when holding the current rank.

        The new bot uses position estimation: honest play deterministically removes cards,
        while lying risks picking up the pile. Honest play should therefore dominate.
        """
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        game.current_rank = "K"
        # Add a play action so last_play() returns valid data when the bot evaluates calling
        game.add_play_action(3, "K", [Card("K", "♠")])
        game.pile = [Card("J", "♣")]

        # Bot has Kings
        bot.hand = [Card("K", "♠"), Card("K", "♥"), Card("Q", "♣"), Card("Q", "♦")]

        truthful_plays = 0
        total_plays = 0
        for _ in range(100):
            bot.last_action_idx = 0
            bot.other_player_repr = {}
            action = await bot.make_move(game)

            if action.type == "play":
                total_plays += 1
                played = action.data["cards_played"]
                if all(c.rank == "K" for c in played):
                    truthful_plays += 1

        # Honest play gives a better position than lying (no call risk), so the bot
        # should prefer it nearly always.
        assert truthful_plays / total_plays > 0.75, (
            f"Bot should prefer honest play when holding the rank, "
            f"played truthfully {truthful_plays}/{total_plays} times"
        )

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
        # Add a play action so last_play() returns valid data when the bot evaluates calling
        game.add_play_action(3, "K", [Card("K", "♠")])
        game.pile = [Card("J", "♣")]

        # Bot has no Kings, but has Aces
        bot.hand = [Card("A", "♠"), Card("A", "♥"), Card("Q", "♣"), Card("Q", "♦")]

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
        """Test that bot plays conservatively (1-2 cards) when forced to lie."""
        bot = SmartBot(id=0, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        game.current_rank = "K"
        # Add a play action so last_play() returns valid data when the bot evaluates calling
        game.add_play_action(3, "K", [Card("Q", "♠")])
        game.pile = [Card("J", "♣")]

        # Bot has no Kings — must lie
        bot.hand = [Card("Q", "♠"), Card("Q", "♥"), Card("Q", "♣"), Card("Q", "♦")]

        # Simulate an aggressive caller so the bot's N_calls/N_plays feed correctly
        bot.other_player_repr[1] = {"N_calls": 8, "N_plays": 2}

        cards_counts = []
        for _ in range(20):
            bot.last_action_idx = len(game.history)
            action = await bot.make_move(game)

            if action.type == "play":
                cards_counts.append(len(action.data["cards_played"]))

        avg_cards = sum(cards_counts) / len(cards_counts)

        # Bot considers up to 2 cards when lying (range(1, min(hand-1, 3))),
        # so average should stay well below 3.
        assert (
            avg_cards < 2.5
        ), f"Bot should play conservatively when lying, avg={avg_cards}"


class TestPlayerReprBuiltDuringMakeMove:
    """Regression tests: verify populate_player_repr is called inside make_move
    and that the resulting representation is correct and influences decisions."""

    @pytest.mark.asyncio
    async def test_repr_populated_after_make_move(self):
        """After make_move, other_player_repr must contain the players from history."""
        bot = SmartBot(id=1, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Player 0 lies; player 2 catches them
        game.add_play_action(0, "K", [Card("Q", "♠")])
        game.add_call_action(2, 0, was_lying=True, revealed_cards=[Card("Q", "♠")])

        game.pile = []
        game.current_rank = None
        bot.hand = [Card("J", "♠"), Card("J", "♥"), Card("Q", "♣")]

        await bot.make_move(game)

        assert (
            bot.other_player_repr
        ), "other_player_repr must not be empty after make_move"
        assert (
            0 in bot.other_player_repr
        ), "player 0 must be tracked after their play action"
        assert (
            2 in bot.other_player_repr
        ), "player 2 must be tracked after their call action"

    @pytest.mark.asyncio
    async def test_repr_counts_correct_after_make_move(self):
        """Counts in other_player_repr must match the history passed to make_move."""
        bot = SmartBot(id=1, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        # Player 0 plays twice, caught lying both times; player 2 calls twice
        for _ in range(2):
            game.add_play_action(0, "K", [Card("Q", "♠")])
            game.add_call_action(2, 0, was_lying=True, revealed_cards=[Card("Q", "♠")])

        game.pile = []
        game.current_rank = None
        bot.hand = [Card("J", "♠"), Card("J", "♥"), Card("Q", "♣")]

        await bot.make_move(game)

        assert bot.other_player_repr[0]["N_lies"] == 2
        assert bot.other_player_repr[0]["N_plays_called"] == 2
        assert bot.other_player_repr[0]["p_lie_est"] == 1.0
        assert bot.other_player_repr[2]["N_calls"] == 2

    @pytest.mark.asyncio
    async def test_repr_increments_across_make_move_calls(self):
        """History processed incrementally: each make_move call only adds new actions."""
        bot = SmartBot(id=1, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)

        game.add_play_action(0, "K", [Card("Q", "♠")])
        game.add_call_action(2, 0, was_lying=True, revealed_cards=[Card("Q", "♠")])

        game.pile = []
        game.current_rank = None
        bot.hand = [Card("J", "♠"), Card("J", "♥"), Card("Q", "♣")]

        await bot.make_move(game)
        first_n_lies = bot.other_player_repr[0]["N_lies"]

        # Add a second lie and call; make_move must process only the new actions
        game.add_play_action(0, "Q", [Card("J", "♦")])
        game.add_call_action(2, 0, was_lying=True, revealed_cards=[Card("J", "♦")])

        await bot.make_move(game)

        assert (
            bot.other_player_repr[0]["N_lies"] == first_n_lies + 1
        ), "N_lies must increment by exactly 1 after one additional caught lie"

    def test_lie_prob_higher_for_known_liar(self):
        """calculate_lie_prob must return a higher average for a player with a lying history.

        Both bots share the same game so p_true_math is identical; the only
        difference is the observed N_lies / N_plays_called in other_player_repr.
        We average many samples to wash out the Beta-distribution noise.
        """
        from cheat.action import GameAction

        game = MockGame(num_players=4)
        for _ in range(5):
            game.add_play_action(0, "K", [Card("Q", "♠")])
            game.add_call_action(2, 0, was_lying=True, revealed_cards=[Card("Q", "♠")])
        game.pile = [Card("3", "♠")]
        game.current_rank = "K"

        last_play = GameAction(
            type="play",
            player_id=0,
            data={"declared_rank": "K", "cards_played": [str(Card("Q", "♠"))]},
        )
        hand = [Card("J", "♠"), Card("J", "♥"), Card("Q", "♣")]

        # Bot with known lying history for player 0
        bot_known = SmartBot(id=1, name="Bot", verbosity=0.0)
        bot_known.hand = hand
        bot_known.populate_player_repr(game)  # N_lies=5, N_plays_called=5

        # Bot with no history
        bot_fresh = SmartBot(id=1, name="BotFresh", verbosity=0.0)
        bot_fresh.hand = hand

        samples = 400
        p_lie_known = (
            sum(bot_known.calculate_lie_prob(last_play, game) for _ in range(samples))
            / samples
        )
        p_lie_unknown = (
            sum(bot_fresh.calculate_lie_prob(last_play, game) for _ in range(samples))
            / samples
        )

        assert p_lie_known > p_lie_unknown + 0.05, (
            f"Known liar should yield higher lie prob ({p_lie_known:.3f}) "
            f"than unknown player ({p_lie_unknown:.3f})"
        )

    def test_call_prob_sensitive_to_caller_history(self):
        """calculate_call_prob must return higher values when the next player
        has a high call rate in other_player_repr.

        calculate_call_prob uses (play.player_id + 1) % num_players as the
        caller, so the test passes play.player_id = bot.id so the lookup is
        (bot.id + 1) % 4 = 2 — the slot where the high-rate data lives.
        """
        bot = SmartBot(id=1, name="Bot", verbosity=0.0)
        game = MockGame(num_players=4)
        game.pile = []
        game.current_rank = "K"
        game.discarded_ranks = []

        from cheat.action import GameAction

        # Hypothetical play by the bot itself — next player (id=2) might call
        play = GameAction(
            type="play",
            player_id=bot.id,  # (bot.id + 1) % 4 = 2 is looked up internally
            data={"declared_rank": "K", "cards_played": [str(Card("J", "♠"))]},
        )

        # With high call rate in repr for player 2 (the next player)
        bot.other_player_repr[2] = {"N_calls": 8, "N_plays": 2}
        samples = 400
        p_call_high = (
            sum(bot.calculate_call_prob(play, game) for _ in range(samples)) / samples
        )

        # With no history for player 2
        bot.other_player_repr = {}
        p_call_none = (
            sum(bot.calculate_call_prob(play, game) for _ in range(samples)) / samples
        )

        assert p_call_high > p_call_none + 0.05, (
            f"Known aggressive caller should yield higher p_call "
            f"({p_call_high:.3f}) than unknown player ({p_call_none:.3f})"
        )

    @pytest.mark.asyncio
    async def test_make_move_lie_rate_drops_when_next_player_calls_frequently(self):
        """Regression: the next player's call rate (in other_player_repr) must reduce
        the bot's willingness to lie.
        """
        game = MockGame(num_players=4)

        # Player 2 has called aggressively (8 calls, 2 non-calls) → p_call_est ~0.8
        for i in range(8):
            game.add_play_action(3, "K", [Card("Q", "♠")])
            game.add_call_action(2, 3, was_lying=True, revealed_cards=[Card("Q", "♠")])
        for i in range(2):
            game.add_play_action(3, "Q", [Card("J", "♠")])  # player 2 passes

        # Force a fixed rank so every trial exercises the lying decision.
        # Hand: 1 Q (honest play removes it) + 2 unique non-Q cards (the
        # k=2 lie plays them both).  The k=1 lie is skipped (fewer cards than
        # honest); k=2 is the interesting choice; k=3 always triggers p_call=1.
        # With game.pile=[] calling isn't available, so the only fork is
        # "play honestly (remove 1 Q)" vs "lie k=2 (remove J+K, risk p_call)".
        game.pile = []
        game.current_rank = "Q"
        game.discarded_ranks = []

        hand = [Card("Q", "♠"), Card("J", "♠"), Card("K", "♠")]

        # bot id=1, next player is id=2 (aggressive caller)
        bot_aggressive_next = SmartBot(
            id=1, name="Bot", verbosity=0.0, temperature=0.01
        )
        bot_aggressive_next.hand = list(hand)

        # bot_ctrl id=0, next player is id=1 (no call history)
        bot_passive_next = SmartBot(
            id=0, name="BotCtrl", verbosity=0.0, temperature=0.01
        )
        bot_passive_next.hand = list(hand)

        # Sync game.players hands so estimate_position uses the real 3-card
        # hand; without this the score fractions barely differ across actions.
        game.players[0].hand = list(hand)
        game.players[1].hand = list(hand)

        trials = 100
        lies_aggressive, lies_passive = 0, 0
        for _ in range(trials):
            bot_aggressive_next.last_action_idx = 0
            bot_aggressive_next.other_player_repr = {}
            action = await bot_aggressive_next.make_move(game)
            if action.type == "play" and any(
                c.rank != action.data["declared_rank"]
                for c in action.data["cards_played"]
            ):
                lies_aggressive += 1

            bot_passive_next.last_action_idx = 0
            bot_passive_next.other_player_repr = {}
            action = await bot_passive_next.make_move(game)
            if action.type == "play" and any(
                c.rank != action.data["declared_rank"]
                for c in action.data["cards_played"]
            ):
                lies_passive += 1

        assert lies_aggressive < lies_passive, (
            f"Bot facing aggressive caller should lie less ({lies_aggressive}) "
            f"than bot facing passive next player ({lies_passive})"
        )


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
