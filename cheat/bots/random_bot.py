import random
import pickle
from cheat.card import RANKS
from .generic_bot import BotPlayer
from cheat.action import GameAction

class RandomBot(BotPlayer):
    """ Random bot that inherits from the parent Player class"""

    def __init__(self, id: int | None = None,
                 name: str | None = None,
                 avatar: str | None = None,
                 p_call: float = 0.3,
                 p_lie: float = 0.3,
                 verbosity: float = 0.3):
        super().__init__(id=id, name=name, avatar=avatar)
        self.p_call = p_call
        self.p_lie = p_lie
        self.verbosity = verbosity

    def __dict__(self):
        return dict(id=self.id, name=self.name, avatar=self.avatar, type=self.type, p_lie=self.p_lie, p_call=self.p_call,
                    verbosity=self.verbosity)

    def write_info(self, path) -> None:
        """ Writes out the configuration"""
        with open(f"{path}/Player_{self.id if self.id is not None else self.name}.pickle", "wb") as file:
            pickle.dump(self.__dict__(), file)

    async def make_move(self, game) -> GameAction:
        """ Play some cards, either true ones or false

        :param game: the current `CheatGame` instance
        :return: (tuple) tuple of declared rank and played cards
        """
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

        # Lie: play random cards, but not from those that have been discarded (must still declare current rank)
        else:
            chosen = random.sample(self.hand, random.randint(1, min(3, len(self.hand))))

        return GameAction(type="play", player_id=self.id,
                              data=dict(declared_rank=declared_rank, cards_played=chosen))

    async def choose_action(self, game) -> GameAction:

        # Must call if the last player played all their cards, otherwise they would automatically win
        # Otherwise, can still call with probability p_call
        if game.pile and (
                random.random() < self.p_call or len(game.players[game.last_play()[0]].hand) == 0
        ):
            return GameAction(type='call', player_id=self.id)

        # Play
        else:
            return await self.make_move(game)
