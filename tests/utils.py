import asyncio
import random
from collections import deque
from unittest.mock import AsyncMock, MagicMock

from fastapi import WebSocketDisconnect

from cheat.action import GameAction
from cheat.card import RANKS, SUITS, Card


class MockWebSocket:
    """Mock WebSocket that stays connected until explicitly closed."""

    def __init__(self):
        self.messages_to_receive = deque()
        self.sent_messages = []
        self.accepted = False
        self.closed = False
        self._close_event: asyncio.Event | None = None

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

        # Lazily create the close event (must be inside an event loop)
        if self._close_event is None:
            self._close_event = asyncio.Event()

        # Race between idle timeout and close() being called. Using asyncio.wait
        # lets close() immediately interrupt the sleep via the event, eliminating
        # the race condition where the test asserts state before the server's
        # disconnect handler has had a chance to run.
        timeout_task = asyncio.create_task(asyncio.sleep(0.5))
        close_task = asyncio.create_task(self._close_event.wait())
        try:
            done, pending = await asyncio.wait(
                {timeout_task, close_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
        except asyncio.CancelledError:
            timeout_task.cancel()
            close_task.cancel()
            raise

        for t in pending:
            t.cancel()

        if self.closed:
            raise WebSocketDisconnect()

        raise asyncio.TimeoutError()

    async def send_json(self, message):
        """Store sent messages for assertion."""
        if not self.closed:
            self.sent_messages.append(message)

    def get_sent_messages_of_type(self, msg_type):
        """Get all sent messages of a specific type."""
        return [msg for msg in self.sent_messages if msg.get("type") == msg_type]

    def get_session_token(self):
        """Return the session token sent by the server for this connection."""
        msgs = self.get_sent_messages_of_type("session_token")
        return msgs[0]["token"] if msgs else None

    def close(self, code=None):
        """Mark websocket as closed and immediately interrupt any in-progress receive.

        Accepts an optional code argument so the server's `await ws.close(code=1001)` call
        (which invokes this synchronously before awaiting the None return value) correctly
        marks the socket closed before the ping loop's timeout exception is caught.
        """
        self.closed = True
        if self._close_event is not None:
            self._close_event.set()


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
        """Deal out the cards to the players"""
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
                "cards_played": [str(c) for c in cards],
            },
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
                "revealed_cards": [str(c) for c in revealed_cards],
            },
        )
        self.history.append(action)

        # Add pile pickup action
        pile_action = GameAction(
            type="pile_picked_up",
            player_id=accused_id if was_lying else caller_id,
            data={"pile": self.pile.copy()},
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
