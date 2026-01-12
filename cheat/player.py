from dataclasses import dataclass
from fastapi import WebSocket
from typing import List, Callable
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
    def __init__(self, id: int | None, name: str, avatar: str, ws: WebSocket = None):
        super().__init__(id=id, name=name, avatar=avatar, type="human", ws=ws)

    def __dict__(self):
        return dict(id=self.id, name=self.name, avatar=self.avatar, type=self.type)

    async def make_move(self, game) -> GameAction:
        # Human players make moves via WebSocket
        pass

def get_player(config: dict) -> Player:
    """Get a player from a configuration"""
    type = config['type']
    if type.lower() == 'smartbot':
        from cheat.bots import SmartBot
        return SmartBot(id=config.get('id', None), name=config['name'], avatar=config.get('avatar', None),
                        verbosity=config.get('verbosity', None))
    elif type.lower() == 'randombot':
        from cheat.bots import RandomBot
        return RandomBot(id=config.get('id', None), name=config['name'], avatar=config.get('avatar', None),
                         p_call=config.get('p_call', None), p_lie=config.get('p_lie', None),
                         verbosity=config.get('verbosity', None))
    elif type.lower() == 'llm':
        from cheat.bots import LLM_Player
        return LLM_Player(id=config.get('id', None), name=config['name'], avatar=config.get('avatar', None), kind=config['kind'],
                          system_prompt=config.get('system_prompt', None), model_kwargs=config.get('model_kwargs', {}))
    elif type.lower() == 'human':
        return HumanPlayer(id=config.get('id', None), name=config['name'], avatar=config.get('avatar', None))
    else:
        raise ValueError(f"Unrecognised player type {type}!")