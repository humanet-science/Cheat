from dataclasses import dataclass
from fastapi import WebSocket
from typing import List, Callable
import random

from cheat.card import Card, RANK_ORDER
from cheat.action import GameAction

# Get the logger
import logging

""" Generic Player class that applies to humans, bots, and LLMs equally """
@dataclass
class Player:
    id: int | None = None
    ws: WebSocket = None
    name: str | None = ""
    avatar: str | None = ""
    hand: List[Card] = None
    type: str = "human"
    connected: bool = True
    input_function: Callable = None
    logger: logging.Logger = None

    def __post_init__(self):
        if self.hand is None:
            self.hand = []

    def __dict__(self):
        pass # Implemented by each type

    def get_info(self) -> dict:
        """ State dictionary that can be broadcast to frontend"""
        return dict(your_info={
            "id": self.id,
            "name": self.name,
            "avatar": self.avatar,
            "type": self.type,
            "hand": [str(card) for card in self.hand],
            "connected": self.connected,
            "cardCount": len(self.hand)
        })

    def write_info(self, path) -> None:
        """ Write out the internal configuration (implemented by subclass)"""
        pass

    def sort_hand(self):
        """ Sort the hand by rank """
        self.hand = sorted(self.hand, key=lambda c: RANK_ORDER[c.rank])

    async def make_move(self, game) -> GameAction:
        # To be implemented by subclasses
        raise NotImplementedError

    async def choose_action(self, game) -> GameAction:
        # To be implemented by subclasses
        raise NotImplementedError

    async def broadcast_message(self, game, *args, **kwargs):
        # Base implementation: humans override with frontend, bots have their own internal message broadcasting
        # mechanisms
        return None

    async def send_message(self, message):
        """ Send a message to the player's websocket"""
        if self.connected and self.ws and hasattr(self, 'ws'):
            try:
                await self.ws.send_json(message)
            except Exception as e:
                self.logger.error(f"Error sending to player {self.id}: {e}")

class HumanPlayer(Player):
    def __init__(self, id: int | None, name: str, avatar: str, ws: WebSocket = None, empirica_id: int | None = None):
        super().__init__(id=id, name=name, avatar=avatar, type="human", ws=ws, connected=ws is not None)
        self.empirica_id = empirica_id

    def __dict__(self):
        return dict(id=self.id, name=self.name, avatar=self.avatar, type=self.type)

    async def make_move(self, game) -> GameAction:
        # Human players make moves via WebSocket
        pass


def get_player(*, type: str, **kwargs) -> Player:
    """ Return a game player type from a configuration.

    :param type: player type
    :param kwargs: passed to the specified Player tye
    :return: a Player instance
    :raises: ValueError if the player type is not recognised
    """

    PERMITTED_PLAYER_TYPES = ['human', 'smartbot', 'randombot', 'llm']

    # Get the player type and raise a ValueError if unrecognised
    if type.lower() not in PERMITTED_PLAYER_TYPES:
        raise ValueError(f"Unrecognised player type {type}! Must be one of {', '.join(PERMITTED_PLAYER_TYPES)}.")

    # HumanPlayer
    if type.lower() == 'human':
        return HumanPlayer(**kwargs)

    # SmartBot
    elif type.lower() == 'smartbot':
        from cheat.bots import SmartBot
        return SmartBot(**kwargs)

    # RandomBot
    elif type.lower() == 'randombot':
        from cheat.bots import RandomBot
        return RandomBot(**kwargs)

    # LLM
    elif type.lower() == 'llm':
        from cheat.bots import LLM_Player
        return LLM_Player(**kwargs)