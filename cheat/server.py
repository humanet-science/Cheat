import asyncio
import copy
import os
import paramspace
import random
import traceback
import yaml

# Package imports
from collections import deque
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel
from typing import Any, Dict, Literal

# Local imports
import cheat.bots
from cheat.game import CheatGame
from cheat.logging_config import setup_logging
from cheat.player import get_player, HumanPlayer
from cheat.utils import game_from_config

# Set up logging
loggers = setup_logging()
server_log = loggers['server']
ws_log = loggers['websocket']

# Path to configuration file, located in root
game_config_path = Path(__file__).parent.parent / "base_config.yaml"
with open(game_config_path, "r") as f:
    game_config = yaml.safe_load(f)

# Set the seed for reproducibility
seed = game_config.get('seed', None)
if seed is not None:
    random.seed(seed)
    server_log.info(f"Random seed set to: {seed}")

# Store the game manager task for potential cleanup
game_manager_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global game_manager_task
    # Startup code
    try:
        game_manager_task = asyncio.create_task(game_manager())
        server_log.info("Game manager started")
    except Exception as e:
        server_log.error(f"Error starting game manager: {e}")
        raise

    yield

    # Shutdown code
    if game_manager_task and not game_manager_task.done():
        game_manager_task.cancel()
        try:
            await game_manager_task
        except asyncio.CancelledError:
            server_log.info("Game manager task cancelled successfully")
        except Exception as e:
            server_log.error(f"Error during game manager shutdown: {e}")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# List of websockets waiting for each type of game
waiting_queues: dict[str, dict[str, deque[Any]]] = dict((k, dict(single=deque([]), multiplayer=deque([]))) for k in [1, 3, 4, 5, 6])

# Active games currently playing
active_games: dict[str, CheatGame] = {} # {game_id: CheatGame instance}

# Survey participants with a websocket waiting to be assigned to a game
survey_participants: dict[str, HumanPlayer] = {} # {empirica_id: HumanPlayer instance}
# Survey games waiting to be started
survey_games: dict[str, CheatGame] = {} # {game_id: CheatGame instance}

# Maximum number of parallel games server can handle
MAX_NUM_ACTIVE_GAMES = game_config['max_num_active_games']

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

    # Add non-human players from config
    for i in range(num_players - len(human_players)):
        player_config = game_config['players'][i]
        game_players.append(get_player(**player_config))

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
        out_dir=game_config["game"].get("out_dir"),
        note=game_config["game"].get("note"),
        predefined_messages=game_config["experiment"].get("predefined_messages", []) if game_config["game"].get("experimental_mode", False) else []
    )

    # Set the system prompt for all LLM players, if not specified from the config
    for i, player in enumerate(game.players):
        # Format the LLM default prompt
        if isinstance(player, cheat.bots.LLM_Player):
            if player.system_prompt is None:
                player.system_prompt = game_config['default_system_prompt'].format(
                    N_players=game.num_players, player_id=player.id
                )

    # Store a link to the human players in the dictionary
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
    if game.out_path is not None:
        file_path = os.path.join(game.out_path, "game_config.yaml")
        with open(file_path, "w") as f:
            yaml.dump(game_config, f)

    # Return the game
    return game

async def try_start_game_from_queue(num_players, mode):
    queue = waiting_queues[num_players][mode]

    # Minimum number of players in queue required to start the game
    min_players = 1 if (num_players == 1 or mode == 'single') else game_config['min_human_players'][num_players]

    if len(queue) >= min_players:

        # Try to create a new game with the people in the front of the queue
        try:
            # Peek at the players first (don't pop yet in case an error occurs)
            _players = []
            for _ in range(min_players):
                player = waiting_queues[num_players][mode][0]
                _players.append(player)

            # Try to create the game (this might fail with API key error)
            _game = new_game(num_players, human_players=_players, mode=mode)

            # If successful, now pop the players
            for _ in range(min_players):
                waiting_queues[num_players][mode].popleft()

            # Add game to list of active games
            active_games[_game.game_id] = _game

            # Start the game loop as a separate task (non-blocking)
            asyncio.create_task(run_game(_game))

        # If an API key is missing (e.g. for a mixed LLM-human game), kick waiting players out of the queue
        except cheat.MissingAPIKeyError as e:
            server_log.error(e)

async def run_game(_game: CheatGame):
    """Run a single game to completion"""
    try:
        server_log.info(f'Starting new game with {len(_game.players)} players; game id: {_game.game_id}.')
        while not _game.game_over:

            await _game.broadcast_to_all({
                "type": "new_round",
                **_game.get_info()
            }, append_state=True)

            # Replace any disconnected humans with bots
            await _game.replace_disconnected_players_with_bots()

            # Play a round
            await _game.play_round()

            # Wait for confirmation of new round from frontend
            if _game.round_over and not _game.game_over:
                server_log.info(f"Round {_game.round} ended in game {_game.game_id}, waiting for continuation")
                await _game.wait_for_new_round()

        # When game is over, remove from active games
        server_log.info(f"Game {_game.game_id} ended.")

        # Check player connection status
        for player in _game.players:
            if player.type == "human":
                server_log.debug(f"Player {player.name}: connected={player.connected}, has_ws={player.ws is not None}")

        # Notify all connected human players that the game is over
        for player in _game.players:
            if player.type == "human" and player.connected and player.ws:
                try:
                    await player.ws.send_json({"type": "quit_confirmed"})
                    server_log.info(f"Sent quit_confirmed to {player.name}")
                except Exception as e:
                    server_log.error(f"Error sending quit_confirmed to {player.name}: {e}")

    except Exception as e:
        server_log.error(f"Error in game {_game.game_id}: {e}")
        traceback.print_exc()
    finally:

        # Cleanup
        if _game.game_id in active_games:
            active_games.pop(_game.game_id)
            server_log.info(f"Number of active games remaining: {len(active_games.keys())}.")

        # Remove player mappings
        for player in _game.players:
            if id(player.ws) in player_to_game:
                del player_to_game[id(player.ws)]

async def game_manager():

    """Continuously check queues and start games when possible"""
    while True:

        # Survey games are prioritised, if they are ready
        for game_id in list(survey_games.keys()):
            if all([p.connected for p in survey_games[game_id].players]):
                if len(active_games) < MAX_NUM_ACTIVE_GAMES:
                    game = survey_games.pop(game_id)
                    active_games[game_id] = game
                    asyncio.create_task(run_game(game))

        # Run additional (non-survey) games with waiting players if possible
        for key in waiting_queues.keys():
            for mode in waiting_queues[key].keys():
                if len(waiting_queues[key][mode]) > 0 and len(active_games) < MAX_NUM_ACTIVE_GAMES:
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
            player = HumanPlayer(
                id=None,
                ws=ws,
                name=data["name"],
                avatar=data["avatar"]
            )
            waiting_queues[data["num_players"]][data["game_mode"]].append(player)

            ws_log.info(
                f"Player {data['name']} joined {data['num_players']}-player queue for mode {data['game_mode']}. "
                f"WebSocket id: {id(ws)}. "
                f"Queue size: {len(waiting_queues[data['num_players']][data['game_mode']])}. "
                f"Number of active games: {len(active_games)}"
            )

            await ws.send_json({"type": "queue_joined", "message": "Waiting for other players..."})

        # Survey participant has completed introduction and is waiting to be assigned to a game.
        # We store the player alongside their websocket and assign them to a game once it is created
        elif data["type"] == "empirica_join":
            player = HumanPlayer(
                id=None,
                ws=ws,
                empirica_id=data["empirica_id"],
                name=data["name"],
                avatar=data["avatar"]
            )

            survey_participants[data["empirica_id"]] = player

            ws_log.info(
                f"Player {data['name']} joined survey queue. "
                f"WebSocket id: {id(ws)}. "
                f"Number of active games: {len(active_games)}"
            )

            await ws.send_json({"type": "player_registered",
                                "message": f"Id {data['empirica_id']} has been added to the participant queue"})

        # Keep connection alive and listen for messages
        while True:
            try:
                message = await asyncio.wait_for(ws.receive_json(), timeout=1.0)

                # Player has left the waiting queue
                if message["type"] == "exit_queue":
                    waiting_queues[data["num_players"]][data["game_mode"]].remove(player)
                    ws_log.info(f"{player.name} exited queue.")

                # Player has quit the game
                elif message["type"] == "quit":

                    player.connected = False
                    ws_log.info(f"Player {player.name} quit game {player_to_game[id(ws)]}")

                    # Check if game should end
                    game_id = player_to_game[id(ws)]
                    if game_id in active_games:
                        game = active_games[game_id]
                        human_players = [p for p in game.players if p.type == "human"]

                        # If this is the last or only human player, just end the game
                        if all(not p.connected for p in human_players):
                            ws_log.info(f"All humans disconnected from game {game_id}.")
                            await game.handle_message(player, {"type": "quit"})
                            game.game_over = True

                        # Replace player with bot if some humans still left
                        else:
                            await game.replace_player_with_bot(player)

                        del player_to_game[id(ws)]

                    # Send confirmation
                    await ws.send_json({"type": "quit_confirmed"})
                    ws_log.info(f"Quit confirmed")

                # Route the message to the correct game
                elif id(ws) in player_to_game:
                    game_id = player_to_game[id(ws)]
                    if game_id in active_games:
                        game = active_games[game_id]
                        await game.handle_message(player, message)
                    else:
                        ws_log.info(f"Game {game_id} no longer active")

                # Unknown message
                else:
                    ws_log.error(f"Message received but player not in any active game: {message}")

            except asyncio.TimeoutError:
                continue

    except WebSocketDisconnect:
        ws_log.info(f"WebSocket disconnected: {player.name if player else 'Unknown'}")
    except Exception as e:
        ws_log.error(f"WebSocket error: {e}")
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
                        ws_log.info(f"Removed {player.name} from queue")
                        break

            # Mark as disconnected in active game if present
            if id(ws) in player_to_game:
                game_id = player_to_game[id(ws)]
                if game_id in active_games:
                    _game = active_games[game_id]
                    for p in _game.players:
                        if p is player:
                            p.connected = False
                            server_log.info(f"Marked {p.name} as disconnected in game {game_id}")
                            break

                    # If this is the last or only human player, just end the game
                    human_players = [p for p in _game.players if p.type == "human"]
                    if all(not p.connected for p in human_players):
                        ws_log.info(f"All humans disconnected from game {game_id}.")
                        await _game.handle_message(player, {"type": "quit"})
                        _game.game_over = True

                    # Replace player with bot if some humans still left
                    else:
                        await _game.replace_player_with_bot(player)

                # Remove from player_to_game mapping
                del player_to_game[id(ws)]

## ---------------------------------------------------------------------------------------------------------------------
## Empirica endpoint: create a game from a config
## ---------------------------------------------------------------------------------------------------------------------

class GameConfigRequest(BaseModel):
    cfg: Dict # overlay with Empirica IDs, experimental_mode, etc.

@app.post("/api/games/from_config")
async def create_game_from_config(req: GameConfigRequest):

    # Load the requested game config
    cfg_key = req.cfg.get('cfg_key')
    experiments_dir = Path(__file__).parent.parent / "experiments"
    config_path = experiments_dir / f"{cfg_key}.yaml"
    with open(config_path, "r") as f:
        _cfg = yaml.safe_load(f)

    # Update everything in the base configuration with the configuration except the player list -- this is
    # overwritten by the new config
    player_config = copy.deepcopy(_cfg['players'])
    _cfg = paramspace.tools.recursive_update(copy.deepcopy(game_config), _cfg)
    _cfg['players'] = player_config
    del player_config

    # Fix the number of rounds specified in the configuration
    _cfg["game"]["n_rounds"] = req.cfg.get('n_rounds')

    # Set the game id to match the Empirica id
    _cfg["game"]["game_id"] = req.cfg.get('game_id')

    # Replace human player configs with actual HumanPlayer instances from survey_participants
    human_player_idx = 0
    empirica_player_ids = req.cfg.get('players', [])

    for idx in range(len(_cfg['players'])):
        if _cfg['players'][idx]['type'] == 'human':
            empirica_id = empirica_player_ids[human_player_idx]
            # Replace the config dict with the actual HumanPlayer instance
            _cfg['players'][idx] = survey_participants.pop(empirica_id)
            human_player_idx += 1

    # Create a new game from the config and add to waiting survey games.
    # This game functions as a placeholder game with 'empty' human players, which can be filled
    # with survey participants as they arrive
    game = game_from_config(_cfg, show_logs=_cfg.get('show_logs', False))

    # Assign game ids to each player
    for idx, player in enumerate(game.players):
        player.id = idx

    # Add game to survey games
    survey_games[game.game_id] = game

    # Add players to routing dict
    for player in game.players:
        if player.type == 'human':
            player_to_game[id(player.ws)] = game.game_id

## ---------------------------------------------------------------------------------------------------------------------
## ---------------------------------------------------------------------------------------------------------------------

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