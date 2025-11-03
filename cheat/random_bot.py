import random
from cheat.game import RANKS

class RandomBot:
    def __init__(self, p_call=0.5, p_lie=0.5):
        self.p_call = p_call
        self.p_lie = p_lie

    def choose_action(self, game, player_idx):
        # Can call only if there is a last play
        if random.random() < self.p_call and len(game.history) > 0:
            return ("call",)

        hand = list(game.players[player_idx])

        # If this is the first play of the trick, choose a declared rank (not Ace)
        if len(game.pile) == 0:
            # choose declared rank strategically or randomly (avoid A)
            declared_rank = random.choice([r for r in RANKS if r != "A"])
        else:
            declared_rank = game.current_rank  # must match current trick rank
        true_cards = [c for c in hand if c.rank == declared_rank]
        if true_cards and random.random() > self.p_lie:
            # play some true cards
            chosen = random.sample(true_cards, random.randint(1, len(true_cards)))
            return ("play", declared_rank, chosen)
        else:
            # lie: play random cards (still must declare current rank)
            chosen = random.sample(hand, random.randint(1, min(3, len(hand))))
            return ("play", declared_rank, chosen)