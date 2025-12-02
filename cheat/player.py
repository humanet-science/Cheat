from dataclasses import dataclass, field
from fastapi import WebSocket
from typing import List
from cheat.card import Card, RANK_ORDER

# Get the logger
import logging
player_log = logging.getLogger('GAME')

""" Generic Player class that applies to humans, bots, and LLMs equally """
@dataclass
class Player:
    id: int | None
    ws: WebSocket = None
    name: str = ""
    avatar: str = ""
    hand: List[Card] = None
    type: str = "human"
    connected: bool = True
    action_idx: list = field(default_factory=list)

    def __post_init__(self):
        if self.hand is None:
            self.hand = []

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

    async def send_message(self, message):
        """ Send a message to the player's websocket"""
        if self.connected and self.ws and hasattr(self, 'ws'):
            try:
                await self.ws.send_json(message)
            except Exception as e:
                player_log.error(f"Error sending to player {self.id}: {e}")

class HumanPlayer(Player):
    def __init__(self, id: int | None, name: str, avatar: str, ws: WebSocket = None):
        super().__init__(id=id, name=name, avatar=avatar, type="human", ws=ws)

    async def make_move(self, game):
        # Human players make moves via WebSocket
        pass
