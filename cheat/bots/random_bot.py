import random
from cheat.game import RANKS
from cheat.player import Player

class RandomBot(Player):

    """ Random bot that inherits from the parent Player class"""

    def __init__(self, id: int, name: str, avatar: str, p_call: float = 0.3, p_lie: float = 0.3):
        super().__init__(id=id, name=name, avatar=avatar, type="bot")
        self.p_call = p_call
        self.p_lie = p_lie

    def make_move(self, game):

        # If this is the first play of the trick, choose a declared rank (not Ace)
        if len(game.pile) == 0:
            # choose declared rank strategically or randomly (cannot declare Ace, and also do not declare a discarded rank)
            declared_rank = random.choice([r for r in RANKS if (r != "A" and r not in game.discarded_ranks)])
        else:
            declared_rank = game.current_rank  # must match current trick rank

        # Check that there are cards that could be played
        true_cards = [c for c in self.hand if c.rank == declared_rank]

        # Play some true cards
        if true_cards and random.random() > self.p_lie:
            chosen = random.sample(true_cards, random.randint(1, len(true_cards)))
            return ("play", declared_rank, chosen)

        # Lie: play random cards, but not from those that have been discarded (must still declare current rank)
        else:
            chosen = random.sample(self.hand, random.randint(1, min(3, len(self.hand))))
            return ("play", declared_rank, chosen)

    def choose_action(self, game):

        # Can call only if there is a last play
        if random.random() < self.p_call and len(game.history) > 0 and game.current_rank is not None:
            return ("call",)

        # Must call if the last player played all their cards, otherwise they would automatically win
        elif len(game.players[game.history[-1][0]].hand) == 0:
            return ("call", )

        # Play
        else:
            return self.make_move(game)

