import random
from cheat.player import Player
from cheat.card import Card, RANKS, SUITS, str_to_Card
from dataclasses import dataclass
from typing import List, Any
from datetime import datetime

class InvalidMove(Exception):
    pass

# General Action class that logs an action
@dataclass
class GameAction:
    type: str  # "play", "call", "discard", "status_message"
    player_id: int
    timestamp: datetime
    data: Any # Flexible data storage


class CheatGame:
    def __init__(self, players: List[Player]):

        # Set up the players
        self.players = players
        self.num_players = len(players)

        # Load and shuffle the deck, then deal out the cards
        self.deck = [Card(r, s) for r in RANKS for s in SUITS]
        random.shuffle(self.deck)
        self.deal_cards()

        # Cards currently on the table
        self.pile = []

        # Ranks that have been discarded
        self.discarded_ranks = []

        # Index of current player
        self.turn = 0

        # Current rank being played
        self.current_rank = None

        # History of all plays
        self.history: List[GameAction] = []

        # Check if game is over: this can be set at any time by a player if they have won
        self.game_over = False
        self.winner = None

    def get_player(self, player_id: int) -> Player:
        return self.players[player_id]

    def get_current_player(self) -> Player:
        return self.players[self.turn]

    def deal_cards(self):
        """ Deal out the cards to the players"""
        while self.deck:
            for player in self.players:
                if self.deck:
                    player.hand.append(self.deck.pop())
        for player in self.players:
            player.sort_hand()

    def next_player(self):
        self.turn = (self.turn + 1) % len(self.players)
        return self.turn

    def last_play(self):
        """ Returns the last hand that was played from the history"""
        if len(self.history) == 0:
            return None, None, None

        last_play_idx = -1
        while self.history[last_play_idx].type != "play":
            last_play_idx -= 1
        last_player = self.history[last_play_idx].player_id
        declared_rank = self.history[last_play_idx].data["declared_rank"]
        cards_played = self.history[last_play_idx].data["cards_played"]

        return last_player, declared_rank, cards_played

    def play_turn(self, player: Player, declared_rank: str, cards_played: list):
        """Player plays some cards and declares a rank (possibly lying)."""

        # If new trick (pile empty) then this declared_rank becomes the round rank
        if len(self.pile) == 0:
            self.current_rank = declared_rank
        else:
            # otherwise must match current_rank
            if declared_rank != self.current_rank:
                raise InvalidMove(f"Must declare {self.current_rank} this trick.")

        # Validate cards are in player's han: this may become necessary later when playing with LLMs
        # TODO: error should be caught and should not crash the game!
        for c in cards_played:
            if c not in player.hand:
                raise InvalidMove("Trying to play a card not in hand.")

        # remove cards and add to pile
        for c in cards_played:
            player.hand.remove(c)
        self.pile.extend([str_to_Card(c) for c in cards_played])
        player.sort_hand()
        self.history.append(
            GameAction(type="play", player_id=player.id, timestamp=datetime.now(),
                       data=dict(declared_rank=declared_rank, cards_played=[str_to_Card(c) for c in cards_played]))
        )

    def call_bluff(self, caller_idx):
        """ Call the last player's bluff """
        last_player, declared_rank, cards_played = self.last_play()

        lying = not all(str_to_Card(c).rank == declared_rank for c in cards_played)
        self.history.append(
            GameAction(type="call", player_id=caller_idx, timestamp=datetime.now(),
                       data=dict(was_lying=lying, accused_id=last_player)
                       )
        )

        if lying:
            self.players[last_player].hand.extend(self.pile)
            self.players[last_player].sort_hand()
            result = f"Player {last_player} lied! Picks up {len(self.pile)} cards."
            self.history.append(
                GameAction(type="pick_up", player_id=self.players[last_player].id, timestamp=datetime.now(),
                           data=self.pile)
            )
        else:
            self.players[caller_idx].hand.extend(self.pile)
            self.players[caller_idx].sort_hand()
            result = f"Player {last_player} told the truth! Player {caller_idx} picks up {len(self.pile)} cards."
            self.history.append(
                GameAction(type="pick_up", player_id=caller_idx, timestamp=datetime.now(),
                           data=self.pile)
            )

        # Clear the pile
        self.pile.clear()

        # Regardless of the result, a new rank begins
        self.current_rank = None

        return result

    def four_of_a_kind_check(self, player: Player):
        """Allow a player to discard 4 of a kind."""
        ranks = [str_to_Card(c).rank for c in player.hand]
        discarded_ranks = []
        for r in set(ranks):
            if r == 'A':
                continue # Aces cannot be discarded
            if ranks.count(r) == 4:
                # discard them
                discarded_ranks.append(r)
                player.hand = [c for c in player.hand if str_to_Card(c).rank != r]
        if discarded_ranks:
            self.discarded_ranks.extend(discarded_ranks)
            self.history.append(
                GameAction(type="discard", player_id=player.id, timestamp=datetime.now(),
                           data=discarded_ranks
                           )
            )
            return f"Player {player.id} discards {', '.join(discarded_ranks)}."
        return None

    def check_winner(self, player) -> bool:
        # Declare a winner if all cards on hands can be truthfully discarded in play
        if len(player.hand) == 0  or (
                all([c.rank==player.hand[0].rank for c in player.hand]) and player.hand[0].rank != "A" and (
                self.current_rank is None or self.current_rank == player.hand[0].rank)
        ):
            self.game_over = True
            self.winner = player.id
            self.history.append(
                GameAction(type="win", player_id=player.id, timestamp=datetime.now(), data=None)
            )
        return self.game_over