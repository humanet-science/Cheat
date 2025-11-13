import asyncio
import yaml
import random
from datetime import datetime
from fastapi import FastAPI, WebSocket,WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from cheat.game import CheatGame, GameAction
from cheat.bots import RandomBot
from cheat.player import Player

# Path to configuration file, located in root
game_config_path = Path(__file__).parent.parent / "config.yaml"
with open(game_config_path, "r") as f:
    game_config = yaml.safe_load(f)

# Set the seed for reproducibility
seed = game_config['game'].get('seed')
random.seed(seed)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def reset_game():

    global game

    # Just start a new round if the game has already been initialised
    if 'game' in globals() and game is not None:
        game.new_round()
        return

    num_players = game_config['game']['num_players']

    # Preserve existing human players from previous game
    human_players = []
    if 'game' in globals() and game:
        human_players = [player for player in game.players if player.type == "human"]

    # Create players
    game_players = []

    # Add preserved human players or create default human
    if human_players:
        # Reset human player state but keep name, avatar, etc.
        for human in human_players:
            human.hand = []
            human.connected = human.ws is not None  # Keep connection status
            game_players.append(human)
    else:
        # First, add the human player if none are already present
        # TODO: as we allow for multiplayer, integrate this with the bots
        game_players.append(Player(
            id=0,
            name="", # these are set when human joins
            avatar="",
            type="human",
            hand=[],
            connected=False
        ))

    # Bot players can always be reset when a new game starts
    # TODO for now ...
    for i, bot_config in enumerate(game_config['bots']):
        # TODO: how is the total number of players determined?
        if i > num_players:
            break
        if bot_config['type'] == "RandomBot":
            game_players.append(RandomBot(
                id=i + 1,
                name=bot_config['name'],
                avatar=bot_config['avatar'],
                p_call=bot_config.get('p_call', 0.3),
                p_lie=bot_config.get('p_lie', 0.3)
            ))
        # TODO: add more bot types

    # Set up a new game
    game = CheatGame(
        players = game_players, experimental_mode = game_config["game"].get("experimental_mode", False),
        out_dir = game_config["game"].get("out_dir")
    )

    # Write metadata to folder
    import os
    file_path = os.path.join(game.out_path, "game_config.yaml")
    with open(file_path, "w") as f:
        yaml.dump(game_config, f)

# Initialize on startup
reset_game()

# Make a state dictionary for a player that can be broadcast to the frontend
def get_game_info() -> dict:
    return {
        "current_player": game.turn,
        "current_player_name": game.players[game.turn].name,
        "current_rank": game.current_rank,
        "players": [player.get_public_info() for player in game.players],
        "hands": [len(p.hand) for p in game.players],
        "num_players": game.num_players,
        "pile_size": len(game.pile),
        "human_ids": [player.id for player in game.players if player.type == 'human'],
        "experimental_mode": game.experimental_mode
    }

def get_player_state(player) -> dict:
    return {
        "your_id": player.id,
        "your_hand": [str(card) for card in player.hand],
        "your_type": player.type,
        "your_name": player.name
    }

async def send_message(player, message):
    if player.connected and player.ws and hasattr(player, 'ws'):
        try:
            await player.ws.send_json(message)
        except Exception as e:
            print(f"Error sending to player {player.id}: {e}")

async def broadcast_to_all(message: dict):
    for player in game.players:
        if player.type != 'bot':
            await send_message(player, message)

async def broadcast_to_others(exclude_player_id: int, message: dict):
    for player in game.players:
        if player.id != exclude_player_id and player.type != 'bot':
            await send_message(player, message)

async def send_state_to_all():
    """ Broadcast player-specific states to all players"""
    for player in game.players:
        if player.type != 'bot':
            await player.ws.send_json({
                "type": "state",
                **get_player_state(player),
                **get_game_info()
            })

async def check_for_winner(player: Player = None) -> bool:
    """ Check if a player has won"""
    for p in game.players if player is None else [player]:
        if game.check_winner(p):
            await broadcast_to_all({"type": "game_over", "winner": p.name})
            break
    return game.game_over


async def check_for_fours(player: Player = None):
    # Check if four of a kind can be discarded: by default, this is the current player, but can also be the previous
    # player.
    player = game.players[game.turn] if player is None else player
    msg = game.four_of_a_kind_check(player)
    print(f"Checking for four of a kind for player {player.name}; result: {msg}.")

    if msg:
        await broadcast_to_all({"type": "discard", "result": msg, **get_game_info()})
        await send_state_to_all()

async def collect_messages(*, player_id: int = None, exclude_player_id: int = None, message_type: str = None) -> bool:

    if player_id is not None:
        _query_players = [game.players[player_id]]
    elif exclude_player_id is not None:
        _query_players = [p for p in game.players if p.id != exclude_player_id]
    else:
        _query_players = game.players

    msg_was_broadcast = False
    for player in _query_players:
        if player.type == "bot":
            msg = player.broadcast_message(game, message_type)
            msg_was_broadcast = msg is not None
            if msg is not None:

                # Log and broadcast the message
                game.log(
                    GameAction(type="bot_message", player_id=player.id, timestamp=datetime.now(), data=msg)
                )
                await broadcast_to_all({"type": "bot_message",
                                        "sender_id": player.id,
                                        "message": msg,
                                        **get_game_info()})

    return msg_was_broadcast

async def play(player: Player, declared_rank: str, cards: list) -> None:

    """ Play a card """
    await collect_messages(player_id=player.id, message_type="thinking")
    game.play_turn(player, declared_rank, cards)
    print(f"Player {player.name} plays {cards} and declared {declared_rank}.")

    # Broadcast the play
    await broadcast_to_all({
        "type": "card_played",
        "cards": [str(c) for c in cards],
        "declared_rank": declared_rank,
        "card_count": len(cards),
        **get_game_info()
    })

    # Collect opinions
    await collect_messages(exclude_player_id=player.id)

    # Move to next player
    game.next_player()
    await send_state_to_all()

async def call(player: Player) -> bool:
    """ Call a play."""

    # Get the data from the last game play
    last_player, declared_rank, cards_played = game.last_play()
    await collect_messages(player_id=player.id, message_type="thinking")

    # Result of the call
    result = game.call_bluff(player.id)

    # Check who picks up the pile to determine who goes next
    if f"Player {player.id} picks up" in result:
        # Caller was wrong: misses a turn
        print(f"Unsuccessful call by {game.players[game.turn].name}")
        game.next_player()
        print(f"{game.players[game.turn].name}'s turn.")
        was_lying = False
    else:
        # Bluff was successful -- caller goes next
        print(f"Successful call by {game.players[game.turn].name}; {game.players[game.turn].name}'s turn.")
        was_lying = True

    # Broadcast bluff result with revealed cards
    await broadcast_to_all({
        "type": "bluff_called",
        "caller": player.id,
        "caller_name": player.name,
        "accused": game.players[last_player].id,
        "accused_name": game.players[last_player].name,
        "declared_rank": declared_rank,
        "actual_cards": [str(c) for c in cards_played],
        "was_lying": was_lying,
        "result": result,
        **get_game_info()
    })

    # Whoever picked up cards does a four-of-a-kind check
    if was_lying:
        await check_for_fours(game.players[last_player])
    else:
        await check_for_fours(player)

    # Send updated state to all clients after bluff
    await send_state_to_all()

    # Collect opinions
    await collect_messages()

    return was_lying

# Global message queue
message_queue = asyncio.Queue()

async def game_loop(ws: WebSocket):
    """ Main game loop function"""

    # Message receiver just puts messages in queue
    async def message_receiver():
        while True:
            try:
                # Receive data from frontend
                data = await ws.receive_json()

                # Restart loop with new game
                if data.get("type") == "new_game":
                    print("Starting a new game")
                    reset_game()
                    await send_state_to_all()

                # Handle chat messages immediately (non-blocking)
                if data.get("type") == "human_message":

                    # Log the message
                    game.log(
                        GameAction(type="human_message", player_id=data["sender_id"], timestamp=datetime.now(),
                                   data=data["message"])
                    )

                    # Broadcast instantly to all players
                    await broadcast_to_all({
                        'type': 'human_message',
                        'sender_id': data["sender_id"],
                        'sender_name': game.players[data["sender_id"]].name,
                        'message': data["message"],
                        'num_players': len(game.players)
                    })

                if data.get("type") == "quit":
                    print(f"Player {data.get('player_id')} requested quit")
                    reset_game()
                    await ws.close()
                    break

                else:
                    # Game actions go to the queue
                    await message_queue.put(data)

            except WebSocketDisconnect:
                break

    # Message receiver task which just runs permanently in the background
    receiver_task = asyncio.create_task(message_receiver())

    try:

        # OUTER LOOP: Keep connection alive for multiple games
        while True:

            # Reset game at the start of each new game session
            await send_state_to_all()

            try:
                # First, wait for the initial message, which is either "play" or "call"
                initial_data = await message_queue.get()
                print(f"Received initial data {initial_data} for round {game.round}")
                if initial_data["type"] == "play":
                    declared_rank = initial_data["declared_rank"]
                    cards = initial_data["cards"]
                    await play(game.players[game.turn], declared_rank, cards)

                elif initial_data["type"] == "call":
                    await call(game.players[game.turn])

                # Now start the loop
                while True:

                    # Check for new messages without blocking
                    try:
                        data = await asyncio.wait_for(message_queue.get(), timeout=0.1)
                        print(f"Received data {data}")

                        # Restart loop with new game
                        if data["type"] == "new_game":
                            print("Starting a new game")
                            reset_game()
                            await send_state_to_all()
                            continue

                    except asyncio.TimeoutError:
                        pass  # No new messages, continue game

                    # Get the current player
                    current_player = game.players[game.turn]
                    print(f"Current player: {current_player.name} (id: {current_player.id}, type: {current_player.type})")

                    # Check if current player has won.
                    # TODO: humans could forget to call last card, which would cause the game to not realise a winner for an
                    # entire cycle ...
                    await check_for_winner(current_player)
                    if game.game_over:
                        await asyncio.sleep(0.1)
                        break

                    # Human's turn
                    if current_player.type == "human":

                        # Get new input
                        data = await message_queue.get()

                        # 0 is currently the only human player
                        if current_player.id == 0:

                            # Card has been played
                            if data["type"] == "play":

                                # Humans could forget to call the last player's card and miss that they had been lying
                                last_player, _, _ = game.last_play()
                                if last_player is not None:
                                    await check_for_winner(game.players[last_player])
                                    if game.game_over:
                                        await asyncio.sleep(0.1)
                                        break

                                declared_rank = data["declared_rank"]
                                cards = data["cards"]
                                await play(current_player, declared_rank, cards)

                            # Calling a bluff
                            elif data["type"] == "call":
                                await call(current_player)

                        else:
                            # It's another human's turn (for future multiplayer)
                            # Just wait - their WebSocket will handle it
                            continue

                    current_player = game.players[game.turn]
                    print(f"Current player: {current_player.name} (id: {current_player.id}, type: {current_player.type})")
                    if current_player.type == 'bot':

                        # Discard any fours
                        await check_for_fours()

                        # Pick an action
                        action = current_player.choose_action(game)

                        # Play card
                        if action[0] == "play":

                            # Check for win
                            game_is_over = await check_for_winner(current_player)
                            if game_is_over:
                                continue

                            _, declared_rank, cards = action
                            await play(current_player, declared_rank, cards)

                        # Call previous play
                        elif action[0] == "call":

                            was_lying = await call(current_player)

                            # If the call was successful, they play
                            if was_lying:
                                game_is_over = await check_for_winner(current_player)
                                if game_is_over:
                                    continue
                                await collect_messages(player_id=current_player.id, message_type="suspicions_confirmed")
                                _, declared_rank, cards = current_player.make_move(game)
                                await play(current_player, declared_rank, cards)
                            else:
                                await collect_messages(player_id=current_player.id, message_type="surprise") # or pile picked up ... also the accused can say something ...

                    # Add a small delay to account for the animations in the frontend: this way the backend is not always
                    # too many steps ahead of the frontend
                    await asyncio.sleep(1)

            except WebSocketDisconnect:
                print(f"WebSocket disconnected")
                break  # Break outer loop completely
            except Exception as e:
                print(f"Game error: {e}")
                # Don't break - continue to next game
                continue

    except WebSocketDisconnect:
        print(f"Client 0 disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        game.players[0].connected = False
        game.players[0].ws = None
        receiver_task.cancel()

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        # Wait for player join info first
        data = await ws.receive_json()
        if data["type"] == "player_join":

            # Update human player info
            game.players[0].name = data["name"]
            game.players[0].avatar = data["avatar"]
            game.players[0].ws = ws
            game.players[0].connected = True

            # Send welcome message with assigned ID
            await ws.send_json({
                "type": "new_game",
                "your_id": 0,
                "your_hand": [str(card) for card in game.players[0].hand],
                "your_type": game.players[0].type,
                **get_game_info()
            })

            # Notify other players (for future multiplayer)
            await broadcast_to_others(0, {
                "type": "player_joined",
                "player": game.players[0].get_public_info()
            })

        # Now continue with the game loop
        await game_loop(ws)

    except WebSocketDisconnect:
        print(f"Player {game.players[0].id} disconnected")

        # Update the human player's connection status in the game
        game.players[0].connected = False
        game.players[0].ws = None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5050) # Port 3000 is reserved for AirPlay on macOS
    args = parser.parse_args()

    from hypercorn.asyncio import serve
    from hypercorn.config import Config

    config = Config()
    config.bind = [f"0.0.0.0:{args.port}"]

    # 'app' is your Quart instance
    asyncio.run(serve(app, config))