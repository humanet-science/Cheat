import random
from cheat.game import RANKS
from cheat.player import Player
from cheat.bots.bot_messages import message_types

class RandomBot(Player):

    """ Random bot that inherits from the parent Player class"""

    def __init__(self, id: int, name: str, avatar: str, p_call: float = 0.3, p_lie: float = 0.3,
                 verbosity: float = 0.3):
        super().__init__(id=id, name=name, avatar=avatar, type="bot")
        self.p_call = p_call
        self.p_lie = p_lie
        self.verbosity = verbosity

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
        elif len(game.last_play()[-1]) == 0:
            return ("call", )

        # Play
        else:
            return self.make_move(game)

    def broadcast_message(self, game, type: str = None, *_, **__):
        """ Broadcast an opinion based on the state of play"""

        # If player just had a turn, don't say anything just keep the noise down
        if ((game.turn - 1) % len(game.players) == self.id):
            return None

        if random.random() > self.verbosity or len(game.history) == 0:
            return None  # Stay silent based on verbosity

        # Return a specific type of message if requested
        if type is not None:
            if type == "thinking" and game.current_rank is None:
                return random.choice(message_types["thinking_new_play"])
            return random.choice(message_types[type])

        # Thinking if it's player's turn
        if game.turn == self.id:
            return random.choice(message_types["thinking"])

        # Get the last action that is a play, a pick-up, or a call
        last_play_idx = -1
        while game.history[last_play_idx].type not in ["play", "call", "pick_up"]:
            last_play_idx -=1
        last_play = game.history[last_play_idx]

        # Express doubt at another player's play
        if last_play.type == "play" and last_play.player_id != self.id and ((game.turn + 1) % len(game.players) != self.id):
            return random.choice(message_types["suspicious"])

        # Express suspicions confirmed
        if last_play.type == "call":
            print("Thikning about what to say about this call lol")
            if last_play["data"]["accused_id"] != self.id and last_play["data"]["was_lying"]:
                return random.choice(message_types["suspicions_confirmed"])
            elif last_play["data"]["accused_id"] != self.id and not last_play["data"]["was_lying"]:
                return random.choice(message_types["surprise"])

        # Express shock at having picked up the pile
        if last_play.type == "pick_up" and last_play.player_id == self.id:
            return random.choice(message_types["pile_picked_up"])

        return None

