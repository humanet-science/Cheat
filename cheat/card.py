""" Defines the Card class"""

RANKS = [str(n) for n in range(2, 11)] + ["J", "Q", "K", "A"]
SUITS = ["♠", "♥", "♦", "♣"]

# Sort by rank (define a helper rank value)
RANK_ORDER = {"2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8, "9":9, "10":10, "J":11, "Q":12, "K":13, "A":14}

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

    def __str__(self):
        return f"{self.rank}{self.suit}"

    def __hash__(self):
        return hash((self.rank, self.suit))

def str_to_Card(object):
    if isinstance(object, Card):
        return object
    elif isinstance(object, str):
        return Card(object[:-1], object[-1])
    raise ValueError(f"Unrecognised object type {type(object)}!")