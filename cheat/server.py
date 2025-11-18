import asyncio
from contextlib import asynccontextmanager
import yaml
import random
import traceback
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import os
from collections import deque

from cheat.game import CheatGame
from cheat.bots import RandomBot
from cheat.player import Player
from typing import Literal

# Path to configuration file, located in root
game_config_path = Path(__file__).parent.parent / "config.yaml"
with open(game_config_path, "r") as f:
    game_config = yaml.safe_load(f)

# Set the seed for reproducibility
seed = game_config['game'].get('seed')
random.seed(seed)

# Store the game manager task for potential cleanup
game_manager_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global game_manager_task
    # Startup code
    try:
        game_manager_task = asyncio.create_task(game_manager())
        print("Game manager started")
    except Exception as e:
        print(f"Error starting game manager: {e}")
        raise

    yield

    # Shutdown code
    if game_manager_task and not game_manager_task.done():
        game_manager_task.cancel()
        try:
            await game_manager_task
        except asyncio.CancelledError:
            print("Game manager task cancelled successfully")
        except Exception as e:
            print(f"Error during game manager shutdown: {e}")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# List of websockets waiting for each type of game
waiting_queues = dict((k, dict(single=deque([]), multiplayer=deque([]))) for k in [1, 3, 4, 5, 6])

# Active games currently playing
active_games = {} # {game_id: CheatGame instance}

# Maximum number of parallel games server can handle
MAX_NUM_ACTIVE_GAMES = 3

# WebSocket-to-Game dictionary for routing messages
player_to_game = {} # {websocket: game_id} for routing messages

def new_game(num_players: int, human_players: list, mode: Literal['single', 'multiplayer']) -> CheatGame:
    """ Creates a new CheatGame instance. Returns a dictionary with the game_id as key and the game as value.

    :param num_players: total number of players
    :param human_players: list of human players. If the game_mode is 'single', the list only has one human player.
        The remaining players are filled up with bots.
    :param mode: game mode (can be 'single' or 'multiplayer')
    :return: dict {game_id: game}
    """
    game_players = []
    game_players.extend(human_players)

    # Fill up with bots
    for i in range(num_players - len(human_players)):
        bot_config = game_config['bots'][i]
        if bot_config['type'] == "RandomBot":
            game_players.append(RandomBot(
                id=None,
                name=bot_config['name'],
                avatar=bot_config['avatar'],
                p_call=bot_config.get('p_call', 0.3),
                p_lie=bot_config.get('p_lie', 0.3),
                verbosity=bot_config.get('verbosity', 0.3)
            ))
        # TODO: add other bots
        # TODO: generalise player adding logic

    # Now randomly shuffle the players if more than one human present
    if len(human_players) > 1:
        random.shuffle(game_players)

    # Assign each player an id
    for i, player in enumerate(game_players):
        player.id = i

    # Set up a new game. Each game maintains its own message queue
    game = CheatGame(
        players=game_players,
        experimental_mode=game_config["game"].get("experimental_mode", False),
        game_mode=mode,
        message_queue = asyncio.Queue(), # Set up a new queue
        out_dir=game_config["game"].get("out_dir")
    )

    for player in human_players:
        player_to_game[id(player.ws)] = game.game_id

    # # Send welcome message with assigned ID
    # for player in game.players:
    #     await player.send_message(
    #         {"type": "new_round",
    #          **player.get_info(),
    #          **game.get_info()}
    #     )

    # Write metadata to folder
    # TODO: currently the same for all games, but some game-specific data (e.g. num_players) must be set from frontend
    file_path = os.path.join(game.out_path, "game_config.yaml")
    with open(file_path, "w") as f:
        yaml.dump(game_config, f)

    # Return the game
    return game


async def try_start_game_from_queue(num_players, mode):

    queue = waiting_queues[num_players][mode]

    # Minimum number of players in queue required to start the game: 1 for single, 2 for 3-player, 3 for all others
    min_players = 1 if (num_players == 1 or mode == 'single') else 2 if num_players == 3 else 3

    if len(queue) >= min_players and len(active_games) < MAX_NUM_ACTIVE_GAMES:

        # Create a new game with the people in the front of the queue
        _players = [waiting_queues[num_players][mode].popleft() for _ in range(min_players)]
        _game = new_game(num_players, human_players=_players, mode = mode)

        # Add game to list of active games
        active_games[_game.game_id] = _game

        # Start the game loop
        while not _game.game_over:
            print(f'Starting new game {_game.game_id} with {len(_game.players)} players.')
            await _game.broadcast_to_all({
                "type": "new_round",
                **_game.get_info()
            }, append_state=True)
            await _game.game_loop()

        # When game is over, remove from active games
        print(f"Game {_game.game_id} ended")
        if _game.game_id in active_games:
            active_games.pop(_game.game_id)

        # Remove player mappings
        for player in _game.players:
            if id(player.ws) in player_to_game:
                del player_to_game[id(player.ws)]

async def game_manager():

    """Continuously check queues and start games when possible"""
    while True:
        if len(active_games) < MAX_NUM_ACTIVE_GAMES:
            for key in waiting_queues.keys():
                for mode in waiting_queues[key].keys():
                    if len(waiting_queues[key][mode]) > 0:
                        await try_start_game_from_queue(key, mode)

        # Check every second
        await asyncio.sleep(1)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    player = None

    try:
        # Wait for player join info
        data = await ws.receive_json()

        # Create Player instance and append to relevant queue
        if data["type"] == "player_join":
            player = Player(
                id=None,
                ws=ws,
                name=data["name"],
                avatar=data["avatar"],
                hand=[],
                type="human",
                connected=True
            )
            waiting_queues[data["num_players"]][data["game_mode"]].append(player)

            print(
                f"Player {data['name']} joined {data['num_players']}-player queue for mode {data['game_mode']}. "
                f"WebSocket id: {id(ws)}. "
                f"Queue size: {len(waiting_queues[data['num_players']][data['game_mode']])}."
            )

            await ws.send_json({"type": "queue_joined", "message": "Waiting for other players..."})

        # Keep connection alive and listen for messages
        while True:
            try:
                message = await asyncio.wait_for(ws.receive_json(), timeout=1.0)
                print(f"Received data for {player.name}: {message}")

                # Player has left the waiting queue
                if message["type"] == "exit_queue":
                    waiting_queues[data["num_players"]][data["game_mode"]].remove(player)
                    print(f"Removed player {player.name} from queue.")

                # Route the message to the correct game
                elif id(ws) in player_to_game:
                    game_id = player_to_game[id(ws)]
                    if game_id in active_games:
                        game = active_games[game_id]
                        await game.handle_message(player, message)
                    else:
                        print(f"Game {game_id} no longer active")

                # Unknown message
                else:
                    print(f"Message received but player not in any active game: {message}")

            except asyncio.TimeoutError:
                continue

    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {player.name if player else 'Unknown'}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        traceback.print_exc()
    finally:

        # Cleanup: mark player as disconnected and remove from mappings
        if player:
            player.connected = False

            # Remove from waiting queue if still there
            for num_players in waiting_queues:
                for mode in waiting_queues[num_players]:
                    if player in waiting_queues[num_players][mode]:
                        waiting_queues[num_players][mode].remove(player)
                        print(f"Removed {player.name} from queue")
                        break

            # Mark as disconnected in active game if present
            if id(ws) in player_to_game:
                game_id = player_to_game[id(ws)]
                if game_id in active_games:
                    _game = active_games[game_id]
                    for p in _game.players:
                        if p is player:  # Use 'is' for object identity
                            p.connected = False
                            print(f"Marked {p.name} as disconnected in game {game_id}")
                            break

                # Remove from player_to_game mapping
                del player_to_game[id(ws)]

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