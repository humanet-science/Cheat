import random

from cheat.player import Player

from .bot_messages import message_types


class BotPlayer(Player):
    def __init__(
        self, id: int | None = None, name: str | None = None, avatar: str | None = None
    ):
        super().__init__(id=id, name=name, avatar=avatar, type="bot")

    def broadcast_message(self, game, type: str = None, *_, **__):
        """Broadcast an opinion based on the state of play"""

        # Return a specific type of message if requested
        if type is not None and random.random() < self.verbosity:
            if type == "thinking" and game.current_rank is None:
                return random.choice(message_types["thinking_new_play"])
            return random.choice(message_types[type])

        # Stay silent based on verbosity
        if random.random() > self.verbosity or len(game.history) == 0:
            return None

        # Get the last action that is a play or a call
        last_play_idx = len(game.history) - 1
        while (
            game.history[last_play_idx].type not in ["play", "call"]
            and last_play_idx > 0
        ):
            last_play_idx -= 1
        last_play = game.history[last_play_idx]

        # If the last play was a call, the two players involved can say something and the others can send a taunt
        if last_play.type == "call":
            # Am the accused
            if last_play.data["accused_id"] == self.id:
                # Got caught lying: only say something if you're not picking up just your own cards
                if last_play.data["was_lying"]:
                    # If you are just picking up your own cards
                    if len(game.history[last_play_idx + 1].data["pile"]) <= 3:
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
                    return random.choice(
                        message_types["surprise"] + message_types["pile_picked_up"]
                    )

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
