import asyncio

from collections import deque
from fastapi import WebSocketDisconnect
import random
from unittest.mock import MagicMock, AsyncMock

from cheat.action import GameAction
from cheat.card import RANKS, SUITS, Card

class MockWebSocket:
    """Mock WebSocket that stays connected until explicitly closed."""

    def __init__(self):
        self.messages_to_receive = deque()
        self.sent_messages = []
        self.accepted = False
        self.closed = False

    async def accept(self):
        self.accepted = True

    def queue_message(self, message):
        """Add a message to be received."""
        self.messages_to_receive.append(message)

    async def receive_json(self):
        """Receive queued messages or timeout to keep connection alive."""
        if self.closed:
            raise WebSocketDisconnect()

        # If we have queued messages, return them
        if self.messages_to_receive:
            return self.messages_to_receive.popleft()

        # Otherwise, simulate waiting with timeout to keep connection alive
        # This is what the real websocket_endpoint expects
        await asyncio.sleep(0.5)
        raise asyncio.TimeoutError()

    async def send_json(self, message):
        """Store sent messages for assertion."""
        if not self.closed:
            self.sent_messages.append(message)

    def get_sent_messages_of_type(self, msg_type):
        """Get all sent messages of a specific type."""
        return [msg for msg in self.sent_messages if msg.get("type") == msg_type]

    def close(self):
        """Mark websocket as closed."""
        self.closed = True

class MockGame:
    """Mock game object for testing."""

    def __init__(self, num_players=4):
        self.num_players = num_players
        self.players = [MagicMock(id=i, hand=[]) for i in range(num_players)]
        self.history = []
        self.pile = []
        self.current_rank = None
        self.discarded_ranks = []
        self.deck = [Card(r, s) for r in RANKS for s in SUITS]
        random.shuffle(self.deck)
        self.deal_cards()

    def deal_cards(self):
        """ Deal out the cards to the players"""
        while self.deck:
            for player in self.players:
                if self.deck:
                    player.hand.append(self.deck.pop())

    def add_play_action(self, player_id, declared_rank, cards, was_lying=None):
        """Add a play action to history."""
        action = GameAction(
            type="play",
            player_id=player_id,
            data={
                "declared_rank": declared_rank,
                "cards_played": [str(c) for c in cards]
            }
        )
        self.history.append(action)
        return action

    def add_call_action(self, caller_id, accused_id, was_lying, revealed_cards):
        """Add a call action to history."""
        action = GameAction(
            type="call",
            player_id=caller_id,
            data={
                "accused_id": accused_id,
                "was_lying": was_lying,
                "revealed_cards": [str(c) for c in revealed_cards]
            }
        )
        self.history.append(action)

        # Add pile pickup action
        pile_action = GameAction(
            type="pile_picked_up",
            player_id=accused_id if was_lying else caller_id,
            data={"pile": self.pile.copy()}
        )
        self.history.append(pile_action)
        return action

    def last_play(self):
        last_player, declared_rank, cards_played = None, None, None
        for item in self.history[::-1]:
            if item.type == "play":
                last_player = item.player_id
                declared_rank = item.data["declared_rank"]
                cards_played = item.data["cards_played"]
                break
        return last_player, declared_rank, cards_played