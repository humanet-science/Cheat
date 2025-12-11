import copy
import traceback
import random
import os
import json
from typing import List, Any
from datetime import datetime
import uuid
import asyncio
from typing import Literal

from cheat.player import Player
from cheat.bots import RandomBot
from cheat.card import Card, RANKS, SUITS, str_to_Card
from cheat.logging_config import setup_game_logger, setup_player_logger
from cheat.action import GameAction

class InvalidMove(Exception):
    pass


class CheatGame:

    def __init__(self,
                 players: List[Player],
                 experimental_mode: bool = False,
                 *,
                 game_mode: Literal["single", "multiplayer"] = "single",
                 message_queue: asyncio.Queue = None,
                 out_dir: str = None,
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
        self.turn = random.randint(0, len(self.players)-1)

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
        if out_dir is not None:
            out_path = os.path.expanduser(
                os.path.join(out_dir, f"game_{_date_time}")
            )
            self.out_path = out_path
            os.makedirs(self.out_path, exist_ok=True)
        else:
            self.out_path = None

        # Get the loggers
        self.logger = setup_game_logger(self.game_id, self.out_path)
        self.player_logger = setup_player_logger(self.game_id, self.out_path)
        self.log(GameAction(type="new_round", player_id=None, timestamp=datetime.now(), data=dict(round=self.round, player_hands=dict((p.id, [str(c) for c in p.hand]) for p in self.players))))
        self.write_action(
            GameAction(type="player_info", player_id=None, timestamp=datetime.now(), data=dict(player_info=[p.__dict__() for p in self.players]))
        )
        for p in self.players:
            p.logger = self.player_logger

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
        self.turn = random.randint(0, len(self.players)-1) # TODO: also shuffle the order of play?
        self.current_rank = None
        self.round_over = False
        self.winner = None
        self.round += 1
        self.log(GameAction(type="new_round", player_id=None, timestamp=datetime.now(), data=dict(round=self.round, player_hands=dict((p.id, [str(c) for c in p.hand]) for p in self.players))))


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
        """ Returns the last hand that was played from the history. If None has been played so far, returns None"""
        last_player, declared_rank, cards_played = None, None, None
        for item in self.history[::-1]:
            if item.type == "play":
                last_player = item.player_id
                declared_rank = item.data["declared_rank"]
                cards_played = item.data["cards_played"]
                break

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
                       data=dict(was_lying=lying, accused_id=last_player, revealed_cards=[str(c) for c in cards_played])
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
            self.player_logger.info(f"{player.name} discards {', '.join(discarded_ranks)}.")
            return f"Player {player.id} discards {', '.join(discarded_ranks)}."
        return None

    def check_winner(self, player) -> bool:
        # Declare a winner if all cards on hands can be truthfully discarded in play and it is the player's turn
        if len(player.hand) == 0 or (
                all([c.rank == player.hand[0].rank for c in player.hand]) and player.hand[0].rank != "A" and self.turn == player.id and (
                self.current_rank is None or self.current_rank == player.hand[0].rank)
        ):
            self.round_over = True
            self.winner = player.id
            self.log(
                GameAction(type="win", player_id=player.id, timestamp=datetime.now(), data=None)
            )
            self.logger.info(f"End of round: {player.name} wins!")
        return self.round_over

    async def check_for_winner(self, player: Player = None) -> bool:
        """ Check if a player has won"""

        # Unique situation: all players left holding Aces
        if all([all([c.rank == 'A' for c in p.hand]) for p in self.players]):
            await self.broadcast_to_all({"type": "round_over", "winner": "None"})
            self.round_over = True
        else:
            for p in self.players if player is None else [player]:
                if self.check_winner(p):
                    await self.broadcast_to_all({"type": "round_over", "winner": p.name})
                    break
        return self.round_over

    def log(self, action: GameAction, **kwargs):
        """ Logs a new action to the database. The index of the action is appended to the players list of actions, so
         that each player's actions can be easily retrieved from the game history. The action is also written to the database"""
        self.history.append(action)
        self.write_action(action, **kwargs)

    def write_action(self, action: GameAction, *, file_name: str = 'game_history'):
        """Write a single action to the data file, if available. If an error occurs during writing,
         the error is logged but the game is not stopped."""
        if self.out_path is not None:
            try:
                file_path = os.path.join(self.out_path, f"{file_name}.jsonl")
                # Write the  action
                record = {
                    'game_id': self.game_id,
                    'round': self.round,  # This is always the current round
                    'type': action.type,
                    'player_id': action.player_id,
                    'timestamp': action.timestamp.isoformat(),
                    'data': action.data if action.type != 'play' else dict(
                        declared_rank=action.data['declared_rank'],
                        cards_played=[str(c) for c in action.data['cards_played']])}
                with open(file_path, 'a') as f:
                    f.write(json.dumps(record) + '\n')

            except Exception as e:
                self.logger.error(f"Error saving game data: {e}")
                traceback.print_exc()

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

    async def broadcast_to_all(self, message: dict, *, append_state: bool = True):
        """ Broadcast a message to all human players in game. If specified, can also append each player's state """
        for player in self.players:
            if append_state:
                msg = copy.deepcopy(message)
                msg.update(player.get_info())
                await player.send_message(msg)
            else:
                await player.send_message(message)

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
        if msg is not None:
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
                msg = player.broadcast_message(self, message_type)
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
                    self.player_logger.info(f"{player.name} broadcasts: {msg}")

        return msg_was_broadcast

    async def handle_message(self, player, data):

        """ Handle messages received through a player's websocket"""

        # Player confirms new round: in this case, they are added to the list of players who want to continue
        # playing.
        if data.get("type") == "new_round":
            if not hasattr(self, '_new_round_confirmations'):
                self._new_round_confirmations = set()
            self._new_round_confirmations.add(player.id)
            self.logger.info(f"Player {player.id} confirmed new round")

            # Notify that someone is ready
            await self.broadcast_to_all({
                "type": "player_ready",
                "player_id": player.id
            })

        # Handle chat messages immediately (non-blocking)
        elif data.get("type") == "human_message":
            # Log the message
            self.log(
                GameAction(type="human_message", player_id=data["sender_id"], timestamp=datetime.now(),
                           data=data["message"])
            )
            self.player_logger.info(f"{self.players[data['sender_id']].name} broadcasts: {data['message']}")

            # Broadcast instantly to all players
            await self.broadcast_to_all({
                'type': 'human_message',
                'sender_id': data["sender_id"],
                'sender_name': self.players[data["sender_id"]].name,
                'message': data["message"],
                'num_players': len(self.players)
            })

        elif data.get("type") == "quit":

            await self.broadcast_to_all({
                "type": "game_ended",
                "reason": "player_quit",
                "player_id": player.id
            })

            self.round_over = True

            # Put in message queue to interrupt the round
            await self.message_queue.put(data)
        else:
            await self.message_queue.put(data)

    async def play(self, player: Player, declared_rank: str, cards: list) -> None:

        """ Play a card """
        await self.collect_messages(player_id=player.id, message_type="thinking")
        self.play_turn(player, declared_rank, cards)
        self.player_logger.info(f"{player.name} plays {', '.join([str(c) for c in cards])} and declares {declared_rank}.")

        # Broadcast the play
        await self.broadcast_to_all({
            "type": "cards_played",
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
            self.player_logger.info(f"Unsuccessful call by {self.players[self.turn].name}.")
            was_lying = False
        else:
            self.player_logger.info(f"Successful call by {self.players[self.turn].name}.")
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
            await self.send_state_to_all()

        return was_lying

    async def play_round(self, *, sleep_pause: float = 1.0):
        """ Main game loop function."""

        # Send out the game state at the start of a new round
        await self.send_state_to_all()

        # Start the round
        while not self.round_over:

            # Check for new messages without blocking
            try:
                data = await asyncio.wait_for(self.message_queue.get(), timeout=0.1)
                self.logger.info(f"Received data {data}")

            except asyncio.TimeoutError:
                pass  # No new messages, continue game

            # Get the current player
            current_player = self.players[self.turn]
            self.logger.info(f"Current player: {current_player.name} (id: {current_player.id}, type: {current_player.type})")

            # Check if current player has won.
            await self.check_for_winner(current_player)
            if self.round_over:
                await asyncio.sleep(0.1)
                break

            # Discard any fours
            await self.check_for_fours()

            # Human's turn
            if current_player.type == "human":

                # Get new input: need to allow for the possibility that a player left during their
                # turn and was replaced by a bot
                data = None
                while data is None:
                    try:
                        data = await asyncio.wait_for(self.message_queue.get(), timeout=0.5)
                    except asyncio.TimeoutError:
                        # Check if player was replaced by a bot while we were waiting
                        current_player = self.players[self.turn]  # Re-fetch current player
                        if current_player.type != "human":
                            self.logger.info(f"Player {self.turn} was replaced by bot, continuing")
                            break  # Exit the waiting loop, will handle as bot on next iteration
                        continue  # Still human, keep waiting

                # If player was replaced, skip to next iteration where it will be handled as bot
                if current_player.type != "human":
                    continue

                # Card has been played
                if data["type"] == "cards_played":

                    # Humans could forget to call the last player's card and miss that they had been lying
                    await self.check_for_winner(self.players[(current_player.id - 1) % self.num_players])
                    if self.round_over:
                        await asyncio.sleep(0.1)
                        break

                    declared_rank = data["declared_rank"]
                    cards = data["cards"]
                    await self.play(current_player, declared_rank, cards)

                # Calling a bluff
                elif data["type"] == "bluff_called":
                    await self.call(current_player)

            elif current_player.type in ['bot', 'LLM']:

                # Discard any fours
                await self.check_for_fours()

                # Pick an action
                action = await current_player.choose_action(self)

                # Play card
                if action.type == "play":

                    # Check for win
                    round_is_over = await self.check_for_winner(current_player)
                    if round_is_over:
                        break

                    declared_rank = action.data.get("declared_rank")
                    cards = action.data.get("cards_played")
                    await self.play(current_player, declared_rank, cards)

                # Call previous play
                elif action.type == "call":

                    was_lying = await self.call(current_player)

                    # If the call was successful, they play
                    if was_lying:
                        round_is_over = await self.check_for_winner(current_player)
                        if round_is_over:
                            break
                        action = await current_player.make_move(self)
                        if action.type == "failure":
                            self.log(action)
                            await self.replace_player_with_bot(current_player)
                            continue
                        declared_rank = action.data.get('declared_rank')
                        cards = action.data.get('cards_played')
                        await self.play(current_player, declared_rank, cards)

                # Failure: disconnect player
                elif action.type == "failure":
                    self.log(action)
                    await self.replace_player_with_bot(current_player)
                    continue

            # Add a small delay to account for the animations in the frontend: this way the backend is not always
            # too many steps ahead of the frontend
            await asyncio.sleep(sleep_pause)


    async def replace_player_with_bot(self, player):
        """Replace a disconnected player with a bot in multiplayer games"""

        # Broadcast that the player is leaving
        await self.broadcast_to_all({
            'type': 'human_message',
            'sender_id': player.id,
            'sender_name': player.name,
            'message': f"{player.name} has left the game.",
            'num_players': len(self.players)
        })
        self.log(GameAction(type="player_exit", player_id=player.id, timestamp=datetime.now(), data=None))
        self.logger.info(f"Player {player.name} left, replacing with bot")

        # Create a bot with the same characteristics
        bot_name = f"{player.name}_bot"
        bot = RandomBot(
            id=player.id,  # Keep the same ID
            name=bot_name,
            avatar=player.avatar,  # Keep the same avatar
            p_call=0.3,
            p_lie=0.3,
            verbosity=0.2
        )

        # Transfer the hand
        bot.hand = player.hand.copy()

        # Replace in the players list
        self.players[player.id] = bot

        self.logger.info(f"Created bot {bot_name} with {len(bot.hand)} cards")
        self.log(GameAction(type="player_replacement", player_id=bot.id, timestamp=datetime.now(),
                            data=dict(bot_name=bot.name)))
        # Broadcast bot introduction
        await self.broadcast_to_all({
            "type": "bot_message",
            "sender_id": bot.id,
            "message": f"🤖 {bot_name} has taken over for {player.name}",
            **self.get_info()
        })

        # Send updated game state to all players
        await self.send_state_to_all()

    async def replace_disconnected_players_with_bots(self):
        # Replace any humans who didn't confirm with bots (if they're disconnected)
        for player in self.players:
            if player.type in ["human", "LLM"] and not player.connected:
                await self.replace_player_with_bot(player)

    async def wait_for_new_round(self):

        self.logger.info("Waiting for players to confirm new round")

        # Initialize confirmations set
        self._new_round_confirmations = set()

        # Start a timer: 30 seconds to start a new round in multiplayer mode
        # Wait for at least one confirmation
        timeout = 30
        start_time = asyncio.get_event_loop().time()

        human_players = [p for p in self.players if p.type == "human"]

        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            remaining = timeout - elapsed

            # Broadcast countdown every second
            current_second = int(remaining)
            if current_second >= 0:
                await self.broadcast_to_all({
                    "type": "countdown",
                    "seconds_remaining": current_second,
                    "confirmed_count": len(self._new_round_confirmations),
                    "total_humans": len(human_players),
                    "waiting_for_players": [player.id for player in self.players if player.type == "human" and player.id not in self._new_round_confirmations]
                })

            # Timeout reached
            if elapsed > timeout:
                if len(self._new_round_confirmations) == 0:
                    # No one confirmed - end game
                    if self.game_mode != 'single':
                        self.logger.info("Timeout with no confirmations, ending game")
                        self.log(GameAction(type="game_over", player_id=None, timestamp=datetime.now(), data=None))
                        self.game_over = True
                        return
                    else:
                        # In single player, just continue
                        break
                else:
                    # At least one person confirmed - continue with them
                    self.logger.info(f"{len(self._new_round_confirmations)} player(s) confirmed, continuing")
                    for player in self.players:
                        if (player.id not in self._new_round_confirmations) and (player.type == 'human'):
                            player.connected = False
                            try:
                                await player.send_message({"type": "quit_confirmed"})
                                await player.ws.close()
                                self.logger.info(f"Closed WebSocket for {player.name}")
                            except Exception as e:
                                self.logger.error(f"Error closing WebSocket for {player.name}: {e}")
                    break

            # Check if all humans confirmed (early exit)
            if len(self._new_round_confirmations) >= len(human_players):
                self.logger.info("All players confirmed, starting immediately")
                break

            # Check if any humans are still connected
            connected_humans = [p for p in self.players if p.type == "human" and p.connected]
            if not connected_humans:
                self.logger.info("No humans connected, ending game")
                self.game_over = True
                return

            # Sleep briefly and check again
            await asyncio.sleep(0.1)

        self.logger.info(f"Player id(s) {', '.join([str(id) for id in self._new_round_confirmations])} confirmed, starting new round")

        # Now actually start the new round
        self.new_round()

        # Clear confirmations for next time
        del self._new_round_confirmations