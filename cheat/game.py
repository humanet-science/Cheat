import random
from collections import deque

RANKS = [str(n) for n in range(2, 11)] + ["J", "Q", "K", "A"]
SUITS = ["♠", "♥", "♦", "♣"]

class InvalidMove(Exception):
    pass

class Card:
    def __init__(self, rank, suit):
        self.rank = rank
        self.suit = suit

    def __repr__(self):
        return f"{self.rank}{self.suit}"

    def __eq__(self, other):
        if isinstance(other, Card):
            return (self.rank == other.rank) and (self.suit == other.suit)
        elif isinstance(other, str):
            return str(self) == other
        return False

    def __hash__(self):
        return hash((self.rank, self.suit))

def str_to_Card(object):
    if isinstance(object, Card):
        return object
    elif isinstance(object, str):
        return Card(object[:-1], object[-1])

class CheatGame:
    def __init__(self, num_players=4):
        self.deck = [Card(r, s) for r in RANKS for s in SUITS]
        random.shuffle(self.deck)
        self.players = [deque() for _ in range(num_players)]
        self.pile = []  # cards currently on table
        self.turn = 0   # index of current player
        self.current_rank = None  # rank being declared
        self.deal_cards()
        self.history = []

    def deal_cards(self):
        while self.deck:
            for player in self.players:
                if self.deck:
                    player.append(self.deck.pop())

    def next_player(self):
        self.turn = (self.turn + 1) % len(self.players)
        return self.turn

    def play_turn(self, player_idx, declared_rank, cards_played):
        """Player plays some cards and declares a rank (possibly lying)."""

        # validate declared rank not Ace
        if declared_rank == "A":
            raise InvalidMove("Aces cannot be declared.")

        # If new trick (pile empty) then this declared_rank becomes the round rank
        if len(self.pile) == 0:
            self.current_rank = declared_rank
        else:
            # otherwise must match current_rank
            if declared_rank != self.current_rank:
                raise InvalidMove(f"Must declare {self.current_rank} this trick.")

        # validate cards are in player's hand
        hand = list(self.players[player_idx])
        for c in cards_played:
            if c not in hand:
                raise InvalidMove("Trying to play a card not in hand.")

        # remove cards and add to pile
        for c in cards_played:
            self.players[player_idx].remove(c)
        self.pile.extend([str_to_Card(c) for c in cards_played])
        self.history.append((player_idx, declared_rank, list(cards_played)))

    def call_bluff(self, caller_idx):
        last_player, declared_rank, cards_played = self.history[-1]
        lying = not all(str_to_Card(c).rank == declared_rank for c in cards_played)

        if lying:
            self.players[last_player].extend(self.pile)
            result = f"Player {last_player} lied! Picks up {len(self.pile)} cards."
        else:
            self.players[caller_idx].extend(self.pile)
            result = f"Player {last_player} told the truth! Player {caller_idx} picks up {len(self.pile)} cards."

        self.pile.clear()
        self.current_rank = None  # <-- important: new trick next
        return result

    def four_of_a_kind_check(self, player_idx):
        """Allow a player to discard 4 of a kind."""
        ranks = [str_to_Card(c).rank for c in self.players[player_idx]]
        for r in set(ranks):
            if ranks.count(r) == 4:
                # discard them
                self.players[player_idx] = deque(c for c in self.players[player_idx] if str_to_Card(c).rank != r)
                return f"Player {player_idx} discards 4 {r}s."
        return None

    def game_over(self):
        for i, hand in enumerate(self.players):
            if len(hand) == 0:
                return i
        return None