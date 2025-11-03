import random
from collections import deque

RANKS = [str(n) for n in range(2, 11)] + ["J", "Q", "K", "A"]
SUITS = ["♠", "♥", "♦", "♣"]
# Sort by rank (define a helper rank value)
RANK_ORDER = {"2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8, "9":9, "10":10, "J":11, "Q":12, "K":13, "A":14}

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

    def sort_hand(self, player_idx):
        self.players[player_idx] = deque(sorted(self.players[player_idx], key=lambda c: RANK_ORDER[c.rank]))

    def deal_cards(self):
        while self.deck:
            for player in self.players:
                if self.deck:
                    player.append(self.deck.pop())
        for i in range(len(self.players)):
            self.sort_hand(i)

    def next_player(self):
        self.turn = (self.turn + 1) % len(self.players)
        return self.turn

    def play_turn(self, player_idx, declared_rank, cards_played):
        """Player plays some cards and declares a rank (possibly lying)."""

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
        self.sort_hand(player_idx)
        self.history.append((player_idx, declared_rank, list(cards_played)))

    def call_bluff(self, caller_idx):
        last_player, declared_rank, cards_played = self.history[-1]
        lying = not all(str_to_Card(c).rank == declared_rank for c in cards_played)

        if lying:
            self.players[last_player].extend(self.pile)
            self.sort_hand(last_player)
            result = f"Player {last_player} lied! Picks up {len(self.pile)} cards."
        else:
            self.players[caller_idx].extend(self.pile)
            self.sort_hand(caller_idx)
            result = f"Player {last_player} told the truth! Player {caller_idx} picks up {len(self.pile)} cards."

        self.pile.clear()
        self.current_rank = None  # <-- important: new trick next
        return result

    def four_of_a_kind_check(self, player_idx):
        """Allow a player to discard 4 of a kind."""
        ranks = [str_to_Card(c).rank for c in self.players[player_idx]]
        discarded_ranks = []
        for r in set(ranks):
            if r == 'A':
                continue # Aces cannot be discarded
            if ranks.count(r) == 4:
                # discard them
                discarded_ranks.append(r)
                self.players[player_idx] = deque(c for c in self.players[player_idx] if str_to_Card(c).rank != r)
        if discarded_ranks:
            return f"Player {player_idx} discards {', '.join(discarded_ranks)}."
        return None

    def game_over(self):
        for i, hand in enumerate(self.players):
            if len(hand) == 0:
                return i
        return None