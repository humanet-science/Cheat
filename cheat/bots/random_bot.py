import random
from cheat.card import RANKS, Card
from cheat.player import Player
from cheat.bots.bot_messages import message_types
from cheat.action import GameAction

class RandomBot(Player):
    """ Random bot that inherits from the parent Player class"""

    def __init__(self, id: int | None = None,
                 name: str | None = None,
                 avatar: str | None = None,
                 p_call: float = 0.3,
                 p_lie: float = 0.3,
                 verbosity: float = 0.3):
        super().__init__(id=id, name=name, avatar=avatar, type="bot")
        self.p_call = p_call
        self.p_lie = p_lie
        self.verbosity = verbosity

    def __dict__(self):
        return dict(id=self.id, name=self.name, avatar=self.avatar, type=self.type, p_lie=self.p_lie, p_call=self.p_call,
                    verbosity=self.verbosity)

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

    def broadcast_message(self, game, type: str = None, *_, **__):
        """ Broadcast an opinion based on the state of play"""

        # Stay silent based on verbosity
        if random.random() > self.verbosity or len(game.history) == 0:
            return None

        # Return a specific type of message if requested
        if type is not None:
            if type == "thinking" and game.current_rank is None:
                return random.choice(message_types["thinking_new_play"])
            return random.choice(message_types[type])

        # Get the last action that is a play or a call
        last_play_idx = -1
        while game.history[last_play_idx].type not in ["play", "call"]:
            last_play_idx -= 1
        last_play = game.history[last_play_idx]

        # If the last play was a call, the two players involved can say something and the others can send a taunt
        if last_play.type == "call":

            # Am the accused
            if last_play.data["accused_id"] == self.id:
                # Got caught lying: only say something if you're not picking up just your own cards
                if last_play.data["was_lying"]:
                    # If you are just picking up your own cards
                    if len(game.history[last_play_idx+1].data["pile"]) <=3:
                        return random.choice(message_types["small_pile_picked_up"])
                    # If you are picking up the pile
                    return random.choice(message_types["pile_picked_up"])

            # Am the accuser:
            elif last_play.player_id == self.id:
                # Caught someone else lying
                if last_play.data["was_lying"]:
                    return random.choice(message_types["suspicions_confirmed"])
                # Failed to catch them and picked up the pile
                else:
                    return random.choice(message_types["surprise"] + message_types['pile_picked_up'])

            # Not involved in the play: can taunt a lie
            else:
                if last_play.data["was_lying"]:
                    return random.choice(message_types["taunt_blatant_lie"])

        # Last play was a play by someone else (i.e. not self)
        elif last_play.type == "play":
            # If it is my turn next, don't say anything here because I will have a chance in a second
            if (last_play.player_id + 1) % len(game.players) == self.id:
                return None
            return random.choice(message_types["suspicious"])

        return None
