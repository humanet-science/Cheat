from dataclasses import dataclass
from fastapi import WebSocket
from typing import List
from cheat.card import Card, RANK_ORDER

""" Generic Player class that applies to humans, bots, and LLMs equally """
@dataclass
class Player:
    id: int
    ws: WebSocket = None
    name: str = ""
    avatar: str = ""
    hand: List[Card] = None
    type: str = "human"
    connected: bool = True

    def __post_init__(self):
        if self.hand is None:
            self.hand = []

    def get_public_info(self):
        return {
            "id": self.id,
            "name": self.name,
            "avatar": self.avatar,
            "type": self.type,
            "connected": self.connected,
            "cardCount": len(self.hand)
        }

    def sort_hand(self):
        """ Sort the hand by rank """
        self.hand = sorted(self.hand, key=lambda c: RANK_ORDER[c.rank])

    async def make_move(self, game) -> dict:
        # To be implemented by subclasses
        raise NotImplementedError

    async def choose_action(self, game):
        # To be implemented by subclasses
        raise NotImplementedError

    async def broadcast_message(self, game, *args, **kwargs):
        # Base implementation: humans override with frontend, bots have their own internal message broadcasting
        # mechanisms
        return None

class HumanPlayer(Player):
    def __init__(self, id: int, name: str, avatar: str, ws: WebSocket = None):
        super().__init__(id=id, name=name, avatar=avatar, type="human", ws=ws)

    async def make_move(self, game):
        # Human players make moves via WebSocket
        pass
