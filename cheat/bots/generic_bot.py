import random

from cheat.player import Player

from .bot_messages import generate_comment


class BotPlayer(Player):
    def __init__(
        self,
        id: int | None = None,
        name: str | None = None,
        display_name: str | None = None,
        display_type: str | None = None,
        avatar: str | None = None,
        verbosity: float = 0.2
    ):
        super().__init__(
            id=id,
            name=name,
            display_name=display_name,
            avatar=avatar,
            type="bot",
            display_type=display_type,
        )
        self.verbosity = verbosity

    def broadcast_message(self, game, type: str = None, *_, **__):
        """Broadcast an opinion based on the state of play"""
        return generate_comment(game, type, verbosity=self.verbosity, id=self.id)
