import random
import os
import json
from cheat.player import Player
from cheat.card import Card, RANKS, SUITS, str_to_Card
from dataclasses import dataclass
from typing import List, Any
from datetime import datetime
import uuid
import asyncio
from typing import Literal
from fastapi import WebSocket, WebSocketDisconnect

class InvalidMove(Exception):
    pass


# General Action class that logs an action
@dataclass
class GameAction:
    type: str  # "play", "call", "discard", "status_message"
    player_id: int
    timestamp: datetime
    data: Any  # Flexible data storage


class CheatGame:

    def __init__(self,
                 players: List[Player],
                 experimental_mode: bool,
                 *,
                 game_mode: Literal["single", "multiplayer"],
                 message_queue: asyncio.Queue,
                 out_dir: str,
                 round: int = 1,
                 game_id: str = None):

        """ CheatGame that can be played for multiple rounds.

        :param players:
        :param experimental_mode:
        :param game_mode:
        :param message_queue:
        :param out_dir:
        :param round:
        :param game_id:
        """
        # Set up the players
        self.players = players
        self.num_players = len(players)

        # Round and unique game id
        self.round = round
        self.game_id = str(uuid.uuid4())[:8] if game_id is None else game_id

        # Single or multipayer mode
        self.game_mode = game_mode

        # Queue of current messages
        self.message_queue = message_queue
        self.message_receiver_tasks = {} # Track tasks by player ID or WebSocket

        # Whether we are using an experimental setup
        self.experimental_mode = experimental_mode

        # Load and shuffle the deck, then deal out the cards
        self.deck = [Card(r, s) for r in RANKS for s in SUITS]
        random.shuffle(self.deck)
        self.deal_cards()

        # Cards currently on the table
        self.pile = []

        # Ranks that have been discarded
        self.discarded_ranks = []

        # Index of current player
        self.turn = 0

        # Current rank being played
        self.current_rank = None

        # History of all plays
        self.history: List[GameAction] = []

        # Check if round is over: this can be set at any time by a player if they have won
        self.round_over = False
        self.winner = None

        # Check if game is over: this terminates the game entirely
        self.game_over = False

        # Create a folder for the game results
        _date_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.expanduser(
            os.path.join(out_dir, f"game_{_date_time}")
        )
        self.out_path = out_path
        os.makedirs(self.out_path, exist_ok=True)

    def get_player(self, player_id: int) -> Player:
        return self.players[player_id]

    def get_current_player(self) -> Player:
        return self.players[self.turn]

    def new_round(self):
        """ Reset to a new game """
        self.deck = [Card(r, s) for r in RANKS for s in SUITS]
        random.shuffle(self.deck)
        for p in self.players:
            p.hand = []
        self.deal_cards()
        self.pile = []
        self.discarded_ranks = []
        self.turn = 0
        self.current_rank = None
        self.round_over = False
        self.winner = None
        self.round += 1

    def deal_cards(self):
        """ Deal out the cards to the players"""
        while self.deck:
            for player in self.players:
                if self.deck:
                    player.hand.append(self.deck.pop())
        for player in self.players:
            player.sort_hand()

    def next_player(self):
        self.turn = (self.turn + 1) % len(self.players)
        return self.turn

    def last_play(self):
        """ Returns the last hand that was played from the history"""
        if len(self.history) == 0:
            return None, None, None

        last_play_idx = -1
        while self.history[last_play_idx].type != "play":
            last_play_idx -= 1
        last_player = self.history[last_play_idx].player_id
        declared_rank = self.history[last_play_idx].data["declared_rank"]
        cards_played = self.history[last_play_idx].data["cards_played"]

        return last_player, declared_rank, cards_played

    def play_turn(self, player: Player, declared_rank: str, cards_played: list):
        """Player plays some cards and declares a rank (possibly lying)."""

        # If new trick (pile empty) then this declared_rank becomes the round rank
        if len(self.pile) == 0:
            self.current_rank = declared_rank
        else:
            # otherwise must match current_rank
            if declared_rank != self.current_rank:
                raise InvalidMove(f"Must declare {self.current_rank} this trick.")

        # Validate cards are in player's han: this may become necessary later when playing with LLMs
        # TODO: error should be caught and should not crash the game!
        for c in cards_played:
            if c not in player.hand:
                raise InvalidMove("Trying to play a card not in hand.")

        # remove cards and add to pile
        for c in cards_played:
            player.hand.remove(c)
        self.pile.extend([str_to_Card(c) for c in cards_played])
        player.sort_hand()
        self.log(
            GameAction(type="play", player_id=player.id, timestamp=datetime.now(),
                       data=dict(declared_rank=declared_rank, cards_played=[str_to_Card(c) for c in cards_played]))
        )

    def call_bluff(self, caller_idx):
        """ Call the last player's bluff """
        last_player, declared_rank, cards_played = self.last_play()

        lying = not all(str_to_Card(c).rank == declared_rank for c in cards_played)
        self.log(
            GameAction(type="call", player_id=caller_idx, timestamp=datetime.now(),
                       data=dict(was_lying=lying, accused_id=last_player)
                       )
        )

        if lying:
            self.players[last_player].hand.extend(self.pile)
            self.players[last_player].sort_hand()
            result = f"Player {last_player} lied! Picks up {len(self.pile)} cards."
            self.log(
                GameAction(type="pick_up", player_id=self.players[last_player].id, timestamp=datetime.now(),
                           data={"pile": [str(c) for c in self.pile]})
            )
        else:
            self.players[caller_idx].hand.extend(self.pile)
            self.players[caller_idx].sort_hand()
            result = f"Player {last_player} told the truth! Player {caller_idx} picks up {len(self.pile)} cards."
            self.log(
                GameAction(type="pick_up", player_id=caller_idx, timestamp=datetime.now(),
                           data={"pile": [str(c) for c in self.pile]})
            )

        # Clear the pile
        self.pile.clear()

        # Regardless of the result, a new rank begins
        self.current_rank = None

        return result

    def four_of_a_kind_check(self, player: Player):
        """Allow a player to discard 4 of a kind."""
        ranks = [str_to_Card(c).rank for c in player.hand]
        discarded_ranks = []
        for r in set(ranks):
            if r == 'A':
                continue  # Aces cannot be discarded
            if ranks.count(r) == 4:
                # discard them
                discarded_ranks.append(r)
                player.hand = [c for c in player.hand if str_to_Card(c).rank != r]
        if discarded_ranks:
            self.discarded_ranks.extend(discarded_ranks)
            self.log(
                GameAction(type="discard", player_id=player.id, timestamp=datetime.now(),
                           data=discarded_ranks
                           )
            )
            return f"Player {player.id} discards {', '.join(discarded_ranks)}."
        return None

    def check_winner(self, player) -> bool:
        # Declare a winner if all cards on hands can be truthfully discarded in play
        if len(player.hand) == 0 or (
                all([c.rank == player.hand[0].rank for c in player.hand]) and player.hand[0].rank != "A" and (
                self.current_rank is None or (self.current_rank == player.hand[0].rank and self.turn == player.id))
        ):
            self.round_over = True
            self.winner = player.id
            self.log(
                GameAction(type="win", player_id=player.id, timestamp=datetime.now(), data=None)
            )
        return self.round_over

    async def check_for_winner(self, player: Player = None) -> bool:
        """ Check if a player has won"""
        for p in self.players if player is None else [player]:
            if self.check_winner(p):
                await self.broadcast_to_all({"type": "game_over", "winner": p.name})
                break
        return self.round_over

    def write_data(self, *, file_name: str = "game_history"):
        """ Write the history to a json file. This function can be called periodically for backup purposes.
        If for any reason writing fails, an exception is printed but the game is not stopped. """
        if not self.history:
            return

        try:
            file_path = os.path.join(self.out_path, f"{file_name}.jsonl")
            with open(file_path, 'a') as f:
                for action in self.history:
                    record = {
                        'game_id': self.game_id,
                        'round': self.round,
                        'type': action.type,
                        'player_id': action.player_id,
                        'timestamp': action.timestamp.isoformat(),
                        'data': action.data if action.type != 'play' else dict(
                            declared_rank=action.data['declared_rank'],
                            cards_played=[str(c) for c in action.data['cards_played']])
                    }
                    f.write(json.dumps(record) + '\n')
        except Exception as e:
            print(f"Error saving game data: {e}")

    def log(self, action: GameAction, **kwargs):
        """ Logs a new action to the database """
        self.history.append(action)
        self.write_data(**kwargs)

    def get_info(self) -> dict:
        """ Produce a dictionary that can be broadcast to the frontend """
        return {
            "current_player": self.turn,
            "current_player_name": self.players[self.turn].name,
            "current_rank": self.current_rank,
            "players": [player.get_info() for player in self.players],
            "hands": [len(p.hand) for p in self.players],
            "num_players": self.num_players,
            "pile_size": len(self.pile),
            "human_ids": [player.id for player in self.players if player.type == 'human'],
            "experimental_mode": self.experimental_mode,
        }

    async def broadcast_to_all(self, message: dict, *, append_state: bool = False):
        """ Broadcast a message to all human players in game. If specified, can also append each player's state """
        for player in self.players:
            await player.send_message(message.update(player.get_info() if append_state else {}))

    async def broadcast_to_others(self, exclude_player_id: int, message: dict):
        """ Broadcast a message to all except one human players in game """
        for player in self.players:
            if player.id != exclude_player_id:
                await player.send_message(message)

    async def send_state_to_all(self):
        """ Broadcast player-specific states to all players in a game"""
        for player in self.players:
            await player.send_message({
                "type": "state",
                **player.get_info(),
                **self.get_info()
            })

    async def check_for_fours(self, player: Player = None):
        # Check if four of a kind can be discarded: by default, this is the current player, but can also be the previous
        # player.
        player = self.players[self.turn] if player is None else player
        msg = self.four_of_a_kind_check(player)
        print(f"Checking for four of a kind for player {player.name}; result: {msg}.")

        if msg:
            await self.broadcast_to_all({"type": "discard", "result": msg, **self.get_info()})
            await self.send_state_to_all()

    async def collect_messages(self, *, player_id: int = None, 
                               exclude_player_id: int = None, 
                               message_type: str = None) -> bool:
        """ Collect messages from all the game players to send to the frontend
        
        :param player_id: player_id to query. If None, all players are queried
        :param exclude_player_id: player_id to omit
        :param message_type: specific type of message to elicit, e.g. 'thinking'. If None, players can decide for themselves
            what to send
        :return: 
        """
        if player_id is not None:
            _query_players = [self.players[player_id]]
        elif exclude_player_id is not None:
            _query_players = [p for p in self.players if p.id != exclude_player_id]
        else:
            _query_players = self.players
    
        msg_was_broadcast = False
        for player in _query_players:
            if player.type == "bot":
                msg = player.broadcast_message(message_type)
                msg_was_broadcast = msg is not None
                if msg is not None:
    
                    # Log and broadcast the message
                    self.log(
                        GameAction(type="bot_message", player_id=player.id, timestamp=datetime.now(), data=msg)
                    )
                    await self.broadcast_to_all({"type": "bot_message",
                                            "sender_id": player.id,
                                            "message": msg,
                                            **self.get_info()})
    
        return msg_was_broadcast

    async def start_message_receiver(self):
        """ Start listening to all human's WebSockets"""
        for player in self.players:
            if player.type == "human" and player.ws:

                # Start listening to each human player's WebSocket
                task = asyncio.create_task(self.message_receiver(player.ws))
                self.message_receiver_tasks[player.id] = task
                self.message_receiver_tasks[player.ws] = task

    async def stop_message_receiver(self):
        for task in self.message_receiver_tasks.values():
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass  # Expected when cancelling tasks

            self.message_receiver_tasks.clear()

    async def message_receiver(self, ws):

        """ Handle messages received through a player's websocket"""
        while True:
            try:

                #  Receive data from frontend
                data = await ws.receive_json()

                # New round
                if data.get("type") == "new_round":
                    # TODO: new round requires all other human players to also click 'new round'
                    print("Starting a new round")
                    self.new_round()
                    await self.send_state_to_all()

                # Handle chat messages immediately (non-blocking)
                elif data.get("type") == "human_message":
                    # Log the message
                    self.log(
                        GameAction(type="human_message", player_id=data["sender_id"], timestamp=datetime.now(),
                                   data=data["message"])
                    )

                    # Broadcast instantly to all players
                    await self.broadcast_to_all({
                        'type': 'human_message',
                        'sender_id': data["sender_id"],
                        'sender_name': self.players[data["sender_id"]].name,
                        'message': data["message"],
                        'num_players': len(self.players)
                    })

                elif data.get("type") == "quit":
                    # TODO need to handle this
                    pass
                    # print(f"Player {data.get('player_id')} requested quit")
                    # reset_game()
                    # await ws.close()
                    # break

            # TODO: how to handle player disconnect?
            except WebSocketDisconnect:
                    break

    async def play(self, player: Player, declared_rank: str, cards: list) -> None:

        """ Play a card """
        await self.collect_messages(player_id=player.id, message_type="thinking")
        self.play_turn(player, declared_rank, cards)
        print(f"Player {player.name} plays {cards} and declared {declared_rank}.")

        # Broadcast the play
        await self.broadcast_to_all({
            "type": "card_played",
            "cards": [str(c) for c in cards],
            "declared_rank": declared_rank,
            "card_count": len(cards),
            **self.get_info()
        })

        # Collect opinions
        await self.collect_messages(exclude_player_id=player.id)

        # Move to next player
        self.next_player()
        await self.send_state_to_all()

    async def call(self, player: Player) -> bool:
        """ Call a play."""

        # Get the data from the last game play
        last_player, declared_rank, cards_played = self.last_play()
        await self.collect_messages(player_id=player.id, message_type="thinking")

        # Result of the call
        result = self.call_bluff(player.id)

        # Check who picks up the pile to determine who goes next
        if f"Player {player.id} picks up" in result:
            print(f"Unsuccessful call by {self.players[self.turn].name}.")
            was_lying = False
        else:
            print(f"Successful call by {self.players[self.turn].name}.")
            was_lying = True

        # Broadcast bluff result with revealed cards
        await self.broadcast_to_all({
            "type": "bluff_called",
            "caller": player.id,
            "caller_name": player.name,
            "accused": self.players[last_player].id,
            "accused_name": self.players[last_player].name,
            "declared_rank": declared_rank,
            "actual_cards": [str(c) for c in cards_played],
            "was_lying": was_lying,
            "result": result,
            **self.get_info()
        })

        # Whoever picked up cards does a four-of-a-kind check
        if was_lying:
            await self.check_for_fours(self.players[last_player])
        else:
            await self.check_for_fours(player)

        # Send updated state to all clients after bluff
        await self.send_state_to_all()

        # Collect opinions
        await self.collect_messages()

        # Unsuccessful call means caller skips a turn
        if not was_lying:
            self.next_player()
        print(f"{self.players[self.turn].name}'s turn.")

        return was_lying

    async def game_loop(self):
        """ Main game loop function."""

        # Start the message receiver task which just runs permanently in the background
        await self.start_message_receiver()

        # Outer loop: keeps connection alive for multiple rounds
        try:
            while True:
    
                # Send out the game state at the start of a new round
                await self.send_state_to_all()
    
                try:

                    # First, wait for the initial message, which is either "play" or "call"
                    initial_data = await self.message_queue.get()
                    print(f"Received initial data {initial_data} for round {self.round}")
                    if initial_data["type"] == "play":
                        declared_rank = initial_data["declared_rank"]
                        cards = initial_data["cards"]
                        await self.play(self.players[self.turn], declared_rank, cards)
    
                    elif initial_data["type"] == "call":
                        await self.call(self.players[self.turn])
    
                    # Start the round
                    while True:
    
                        # Check for new messages without blocking
                        try:
                            data = await asyncio.wait_for(self.message_queue.get(), timeout=0.1)
                            print(f"Received data {data}")
    
                        except asyncio.TimeoutError:
                            pass  # No new messages, continue game
    
                        # Get the current player
                        current_player = self.players[self.turn]
                        print(f"Current player: {current_player.name} (id: {current_player.id}, type: {current_player.type})")
    
                        # Check if current player has won.
                        await self.check_for_winner(current_player)
                        if self.game_over:
                            await asyncio.sleep(0.1)
                            break
    
                        # Human's turn
                        if current_player.type == "human":
                            # Get new input
                            data = await self.message_queue.get()
    
                            # 0 is currently the only human player
                            if current_player.id == 0:
                                # Card has been played
                                if data["type"] == "play":
    
                                    # Humans could forget to call the last player's card and miss that they had been lying
                                    last_player, _, _ = self.last_play()
                                    if last_player is not None:
                                        await self.check_for_winner(self.players[last_player])
                                        if self.game_over:
                                            await asyncio.sleep(0.1)
                                            break
    
                                    declared_rank = data["declared_rank"]
                                    cards = data["cards"]
                                    await self.play(current_player, declared_rank, cards)
    
                                # Calling a bluff
                                elif data["type"] == "call":
                                    await self.call(current_player)
    
                            else:
                                # It's another human's turn (for future multiplayer)
                                # Their WebSocket will handle it
                                continue
    
                        current_player = self.players[self.turn]
                        print(f"Current player: {current_player.name} (id: {current_player.id}, type: {current_player.type})")
                        if current_player.type == 'bot':
    
                            # Discard any fours
                            await self.check_for_fours()
    
                            # Pick an action
                            action = current_player.choose_action(self)
    
                            # Play card
                            if action[0] == "play":
    
                                # Check for win
                                game_is_over = await self.check_for_winner(current_player)
                                if game_is_over:
                                    continue
    
                                _, declared_rank, cards = action
                                await self.play(current_player, declared_rank, cards)
    
                            # Call previous play
                            elif action[0] == "call":
    
                                was_lying = await self.call(current_player)
    
                                # If the call was successful, they play
                                if was_lying:
                                    game_is_over = await self.check_for_winner(current_player)
                                    if game_is_over:
                                        continue
                                    _, declared_rank, cards = current_player.make_move(self)
                                    await self.play(current_player, declared_rank, cards)
    
                        # Add a small delay to account for the animations in the frontend: this way the backend is not always
                        # too many steps ahead of the frontend
                        await asyncio.sleep(1)

                # TODO handle this better
                except WebSocketDisconnect:
                    print(f"WebSocket disconnected")
                    break  # Break outer loop completely
                except Exception as e:
                    print(f"Game error: {e}")
                    # Don't break - continue to next game
                    continue
    
        except WebSocketDisconnect:
            print(f"Client disconnected")
        except Exception as e:
            print(f"WebSocket error: {e}")
        finally:
            await self.stop_message_receiver()
            self.game_over = True