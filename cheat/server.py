import asyncio
import copy
import json
import os
import random
import secrets
import traceback

# Package imports
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Literal

import aiosqlite
import paramspace
import yaml

# Load the API keys
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

load_dotenv(override=True)

# Local imports
import cheat.bots
from cheat.game import CheatGame
from cheat.logging_config import setup_logging
from cheat.player import HumanPlayer, get_player
from cheat.utils import game_from_config

# Set up logging
loggers = setup_logging()
server_log = loggers["server"]
ws_log = loggers["websocket"]

# Path to configuration file, located in root
game_config_path = Path(__file__).parent.parent / "base_config.yaml"
with open(game_config_path) as f:
    game_config = yaml.safe_load(f)

# Set the seed for reproducibility
seed = game_config.get("seed", None)
if seed is not None:
    random.seed(seed)
    server_log.info(f"Random seed set to: {seed}")

# Store the game manager task for potential cleanup
game_manager_task = None

# Track pending out_path cleanup tasks so they can be cancelled on shutdown
_cleanup_tasks: set[asyncio.Task] = set()

# Participant tracking database
DB_PATH = Path(__file__).parent.parent / "game_data" / "participants.db"

# Delay (seconds) before removing a game's out_path from the cache after it ends
OUT_PATH_CLEANUP_DELAY = 1800

# Admin panel password — set ADMIN_PASSWORD in .env; no default so it fails closed
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

# WebSocket health / reconnection tuning — exposed as module-level constants so tests
# can patch them without waiting real wall-clock time.
PING_INTERVAL_SECONDS: float = 5.0
PING_TIMEOUT_SECONDS: float = 5.0
RECONNECT_GRACE_SECONDS: float = 30.0


async def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS participants (
                prolific_id   TEXT PRIMARY KEY,
                tutorial_done INTEGER DEFAULT 0,
                game_assigned INTEGER DEFAULT 0,
                created_at    TEXT DEFAULT (datetime('now'))
            )
        """
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Study schedule
# ---------------------------------------------------------------------------


@dataclass
class GameSlot:
    """A scheduled study game that has not yet been instantiated."""

    config: dict  # merged treatment + base config
    num_humans: int  # participants needed to start
    max_waiting_time: int  # seconds before frontend redirects to timeout screen


def build_schedule() -> deque:
    """Read experiments.yaml and return a shuffled deque of GameSlots."""
    experiments_path = Path(__file__).parent.parent / "experiments.yaml"
    if not experiments_path.exists():
        server_log.warning("experiments.yaml not found; study schedule is empty")
        return deque()

    with open(experiments_path) as f:
        experiments = yaml.safe_load(f)

    randomize = experiments.get("randomize_treatments", False)
    slots = []

    for treatment in experiments.get("treatments", []):
        num_humans = sum(1 for p in treatment["players"] if p.get("type") == "human")
        num_games = treatment.get("num_games", 1)

        # Merge treatment config into a copy of the base config
        player_config = copy.deepcopy(treatment["players"])
        cfg = paramspace.tools.recursive_update(copy.deepcopy(game_config), treatment)
        cfg["players"] = player_config

        # Normalise: num_rounds → game.n_rounds
        if "num_rounds" in treatment:
            cfg["game"]["n_rounds"] = treatment["num_rounds"]

        # Normalise: top-level predefined_messages → experiment.predefined_messages
        if "predefined_messages" in treatment:
            cfg.setdefault("experiment", {})["predefined_messages"] = treatment.get(
                "predefined_messages"
            )

        # max_waiting_time is in minutes in the yaml; convert to seconds here
        max_waiting_time = treatment.get("max_waiting_time", 15) * 60

        # Remove treatment-only top-level keys that don't belong in the game config
        for key in (
            "num_games",
            "num_rounds",
            "predefined_messages",
            "max_waiting_time",
        ):
            cfg.pop(key, None)

        for i in range(num_games):
            slots.append(
                GameSlot(
                    config=copy.deepcopy(cfg),
                    num_humans=num_humans,
                    max_waiting_time=max_waiting_time,
                )
            )

    if randomize:
        random.shuffle(slots)

    server_log.info(
        f"Study schedule built with {len(slots)} slot{'s' if len(slots) != 1 else ''}"
    )
    return deque(slots)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global game_manager_task, schedule
    # Startup code
    try:
        await init_db()
        schedule = build_schedule()
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

    # Cancel any pending out_path cleanup tasks
    for task in list(_cleanup_tasks):
        task.cancel()
    if _cleanup_tasks:
        await asyncio.gather(*_cleanup_tasks, return_exceptions=True)
        _cleanup_tasks.clear()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# List of websockets waiting for each type of game
waiting_queues: dict[str, dict[str, deque[Any]]] = {
    k: dict(single=deque([]), multiplayer=deque([])) for k in [1, 3, 4, 5, 6]
}

# Games waiting to be started
waiting_games: dict[str, CheatGame] = {}  # {game_id: CheatGame instance}

# Track when games were created, and remove them after one hour if they haven't yet started
waiting_game_created_at: dict[str, float] = {}  # {game_id: timestamp}

# Dictionary of game creators. Only the people who open a room can cancel the game, and when they cancel the game
# the room is closed and removed from the server to prevent 'zombie' games from accumulating
game_creators: dict[str, str] = {}  # {player.session_token: game_id}

# Active games currently playing
active_games: dict[str, CheatGame] = {}  # {game_id: CheatGame instance}

# Maximum number of parallel games server can handle
MAX_NUM_ACTIVE_GAMES = game_config["max_num_active_games"]

# Study schedule: deque of GameSlots, populated at startup from experiments.yaml
schedule: deque[GameSlot] = deque()

# Participants who have joined the study queue and are waiting to be assigned a game
study_participants: deque[HumanPlayer] = deque()

# WebSocket-to-Game dictionary for routing messages
player_to_game: dict[
    int, str
] = {}  # {player.session_token: game_id} for routing messages

# Pending reconnection slots: session token -> {player, game_id, task}
reconnection_slots: dict[str, dict] = {}

# Maps game_id -> out_path for survey saving (persists after game ends)
game_out_paths: dict[str, str] = {}


def new_game(
    num_players: int, human_players: list, mode: Literal["single", "multiplayer"]
) -> CheatGame:
    """Creates a new CheatGame instance. Returns a dictionary with the game_id as key and the game as value.

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
        player_config = game_config["players"][i]
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
        message_queue=asyncio.Queue(),  # Set up a new queue
        out_dir=game_config["game"].get("out_dir"),
        note=game_config["game"].get("note"),
        predefined_messages=game_config.get("predefined_messages", None),
    )

    # Set the system prompt for all LLM players, if not specified from the config
    for i, player in enumerate(game.players):
        # Format the LLM default prompt
        if isinstance(player, cheat.bots.LLM_Player):
            if player.system_prompt is None:
                player.system_prompt = game_config["default_system_prompt"].format(
                    N_players=game.num_players,
                    player_id=player.id,
                    player_id_before=(player.id - 1) % game.num_players,
                    player_id_after=(player.id + 1) % game.num_players,
                )

    # Store a link to the human players in the dictionary, if not already present
    for player in human_players:
        if player.session_token and player.session_token not in player_to_game:
            player_to_game[player.session_token] = game.game_id

    # Write metadata to folder
    if game.out_path is not None:
        file_path = os.path.join(game.out_path, "game_config.yaml")
        with open(file_path, "w") as f:
            yaml.dump(game_config, f)
        game_out_paths[game.game_id] = game.out_path

    # Return the game
    return game


async def try_start_game_from_queue(num_players, mode):
    queue = waiting_queues[num_players][mode]

    # Minimum number of players in queue required to start the game
    min_players = (
        1
        if (num_players == 1 or mode == "single")
        else game_config["min_human_players"][num_players]
    )

    if len(queue) >= min_players:
        # Try to create a new game with the people in the front of the queue
        try:
            # Peek at the players first (don't pop yet in case an error occurs)
            _players = []
            for k in range(min_players):
                player = waiting_queues[num_players][mode][k]
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


async def start_study_slot(slot: GameSlot):
    """Instantiate and start a study game, pulling players from study_participants."""
    try:
        cfg = copy.deepcopy(slot.config)
        human_idx = 0

        for idx in range(len(cfg["players"])):
            p_cfg = cfg["players"][idx]
            if isinstance(p_cfg, dict) and p_cfg.get("type") == "human":
                real_player = study_participants.popleft()
                # Preserve display_name / display_type from the treatment config
                if p_cfg.get("display_name"):
                    real_player.display_name = p_cfg["display_name"]
                if p_cfg.get("display_type"):
                    real_player.display_type = p_cfg["display_type"]
                cfg["players"][idx] = real_player
                human_idx += 1
            elif isinstance(p_cfg, dict) and p_cfg.get("type") == "LLM":
                p_cfg["system_prompt"] = cfg["default_system_prompt"].format(
                    N_players=len(cfg["players"]),
                    player_id=idx,
                    player_id_before=(idx - 1) % len(cfg["players"]),
                    player_id_after=(idx + 1) % len(cfg["players"]),
                )

        game = game_from_config(cfg, show_logs=cfg.get("show_logs", False))

        for player in game.players:
            if player.type == "human":
                player_to_game[player.session_token] = game.game_id

        active_games[game.game_id] = game
        if game.out_path is not None:
            game_out_paths[game.game_id] = game.out_path
        asyncio.create_task(run_game(game))
        server_log.info(f"Started study game {game.game_id}.")
    except Exception as e:
        server_log.error(f"Error starting study slot: {e}")
        traceback.print_exc()


async def run_game(_game: CheatGame):
    """Run a single game to completion"""
    try:
        server_log.info(
            f"Starting new game with {len(_game.players)} players; game id: {_game.game_id}."
        )
        while not _game.game_over:
            await _game.broadcast_to_all(
                {"type": "new_round", **_game.get_info()}, append_state=True
            )

            # Replace any disconnected humans with bots
            await _game.replace_disconnected_players_with_bots()

            # Play a round
            await _game.play_round()

            # Wait for confirmation of new round from frontend
            if _game.round_over and not _game.game_over:
                server_log.info(
                    f"Round {_game.round} ended in game {_game.game_id}, waiting for continuation"
                )
                await _game.wait_for_new_round()

        # When game is over, remove from active games
        server_log.info(f"Game {_game.game_id} ended.")

        # Check player connection status
        for player in _game.players:
            if player.type == "human":
                server_log.debug(
                    f"Player {player.name}: connected={player.connected}, has_ws={player.ws is not None}"
                )

        # Notify all connected human players that the game is over
        for player in _game.players:
            if player.type == "human" and player.connected and player.ws:
                try:
                    await player.ws.send_json({"type": "quit_confirmed"})
                    server_log.info(f"Sent quit_confirmed to {player.name}")
                except Exception as e:
                    server_log.error(
                        f"Error sending quit_confirmed to {player.name}: {e}"
                    )

    except Exception as e:
        server_log.error(f"Error in game {_game.game_id}: {e}")
        traceback.print_exc()
    finally:
        # Cleanup
        if _game.game_id in active_games:
            active_games.pop(_game.game_id)
            server_log.info(
                f"Number of active games remaining: {len(active_games.keys())}."
            )

        # Schedule out_path cleanup after 30 minutes (enough time for survey submission)
        async def _cleanup_out_path():
            try:
                await asyncio.sleep(OUT_PATH_CLEANUP_DELAY)
                game_out_paths.pop(_game.game_id, None)
            except asyncio.CancelledError:
                pass

        task = asyncio.create_task(_cleanup_out_path())
        _cleanup_tasks.add(task)
        task.add_done_callback(_cleanup_tasks.discard)

        # Remove player mappings
        for player in _game.players:
            if player.session_token in player_to_game:
                player_to_game.pop(player.session_token)


async def game_manager():
    """Continuously check queues and start games when possible"""
    while True:
        # Get current time
        now = asyncio.get_event_loop().time()

        # Start waiting games, if they are ready
        for game_id in list(waiting_games.keys()):
            # Check when game was created, and remove if game hasn't been started after one hour
            created_at = waiting_game_created_at[game_id]
            if now - created_at > 3600:
                game = waiting_games.pop(game_id)
                waiting_game_created_at.pop(game_id)

                # Notify any still-connected waiting players
                for p in game.players:
                    if p.type == "human" and p.connected and p.ws:
                        try:
                            await p.ws.send_json(
                                {"type": "game_cancelled", "is_creator": False}
                            )
                        except Exception:
                            pass
                        game_creators.pop(p.session_token, None)
                server_log.info(f"Expired waiting game {game_id} after 1 hour.")

            # Try to start game
            if all([p.connected for p in waiting_games[game_id].players]):
                if len(active_games) < MAX_NUM_ACTIVE_GAMES:
                    game = waiting_games.pop(game_id)
                    active_games[game_id] = game
                    asyncio.create_task(run_game(game))

        # Run games once enough players are in the queue
        for key in waiting_queues.keys():
            for mode in waiting_queues[key].keys():
                if (
                    len(waiting_queues[key][mode]) > 0
                    and len(active_games) < MAX_NUM_ACTIVE_GAMES
                ):
                    await try_start_game_from_queue(key, mode)

        # Start study game when enough participants are queued for the next slot
        if schedule and len(study_participants) >= schedule[0].num_humans:
            if len(active_games) < MAX_NUM_ACTIVE_GAMES:
                slot = schedule.popleft()
                await start_study_slot(slot)

        # Check every second
        await asyncio.sleep(1)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    player = None
    _ping_task = None

    try:
        # Wait for player join info
        data = await ws.receive_json()

        # Reconnecting player: swap the old websocket for this new one and resume.
        if data["type"] == "reconnect":
            token = data.get("token")
            slot = reconnection_slots.pop(token, None) if token else None
            if slot:
                slot["task"].cancel()
                old_player = slot["player"]
                game_id = slot["game_id"]
                old_player.ws = ws
                old_player.connected = True
                old_player.session_token = token
                player = old_player
                player_to_game[player.session_token] = game_id
                _game = active_games.get(game_id)
                if _game:
                    await old_player.send_message(
                        {
                            "type": "reconnect_confirmed",
                            **old_player.get_info(),
                            **_game.get_info(),
                        }
                    )

                    await _game.send_state_to_all()

                    # Send catch-up only when it's the reconnecting player's turn and the pile has not been cleared,
                    # since they need context to act. Otherwise they will see the next play naturally.
                    # if _game.turn == old_player.id and _game.pile_plays:
                    await old_player.send_message(
                        {
                            "type": "catch_up",
                            "pile_plays": _game.pile_plays,
                        }
                    )

                    ws_log.info(
                        f"Player {old_player.name} reconnected to game {game_id}"
                    )
            else:
                await ws.send_json({"type": "reconnect_failed"})
                return
            # Fall through to ping loop + message loop so the connection stays alive.

        # If a new player wants to join, create Player instance and append to relevant queue.
        # The queue may be the queue for a quick-pairing match, or, if a game key is provided, for a
        # specific game.
        elif data["type"] in ["player_join", "create_game", "study_join"]:
            player = HumanPlayer(
                id=None,
                ws=ws,
                identifier=data.get("prolific_id"),  # for Prolific experiments only
                display_name=None,  # is set in experiments from the config
                display_type=None,  # is set in experiments from the config
                name=data["name"],
                avatar=data["avatar"],
            )
            player.session_token = secrets.token_urlsafe(16)
            await ws.send_json({"type": "session_token", "token": player.session_token})

        # Player wants to create a new game: in this case, a new game with the requested configuration
        # is created, the creating player added, and the remaining player slots filled with bots or empty (placeholder)
        # humans until enough humans have requested to join this specific game for it to start.
        if data["type"] == "create_game":
            # Read the number of humans and bots in the request
            num_humans = data["num_humans"]
            num_bots = data["num_bots"]

            # Add placeholder humans and bots
            human_players = [player] + [
                HumanPlayer(id=None, name="", avatar="") for _ in range(num_humans - 1)
            ]

            # Create a new multiplayer game
            game = new_game(
                num_players=num_humans + num_bots,
                human_players=human_players,
                mode="multiplayer",
            )

            # Add the game to waiting games
            player_to_game[player.session_token] = game.game_id
            waiting_games[game.game_id] = game
            waiting_game_created_at[game.game_id] = asyncio.get_event_loop().time()

            # Name the player as the game creator: only they can terminate the game
            game_creators[player.session_token] = game.game_id

            # Broadcast the game key to frontend so it can be shared with others
            await ws.send_json({"type": "game_created", "key": game.game_id})
            ws_log.info(
                f"Player {player.name} created game {game.game_id} for {num_humans} humans "
                f"and {num_bots} bot{'s' if num_bots > 1 else ''}."
            )

        # Player wants to join a game; if the request contains a game key, check a game with that key exists
        # and can be joined. If not game key has been supplied, simply add player to generic queue for
        # requested game type
        elif data["type"] == "player_join":
            # Player wants to join a specific game; if game key is wrong or game has already stated,
            # inform the frontend
            if data.get("game_key") is not None:
                ws_log.info(
                    f"Player {data['name']} requested to join game {data['game_key']}. "
                    f"Number of active games: {len(active_games)}"
                )

                # Game key is not valid
                if (
                    data["game_key"] not in waiting_games
                    and data["game_key"] not in active_games
                ):
                    ws_log.info(f"Game key {data['game_key']} invalid.")
                    await ws.send_json(
                        {"type": "invalid_key", "message": "Key not valid"}
                    )

                # Game is already full
                elif (
                    data["game_key"] not in waiting_games
                    and data["game_key"] in active_games
                ):
                    ws_log.info(f"Game {data['game_key']} already in progress.")
                    await ws.send_json(
                        {"type": "invalid_key", "message": "Game already in progress"}
                    )

                # Add player to game. Since the generic game as already assigned ids to all the players,
                # just add the websocket, name, and avatar of the human player
                else:
                    # Get the game and add the player to an available human slot
                    _game = waiting_games[data["game_key"]]
                    for idx in range(len(_game.players)):
                        p = _game.players[idx]
                        if p.type == "human" and not p.connected:
                            # Get the assigned id and hand
                            player.id = _game.players[idx].id
                            player.hand = _game.players[idx].hand

                            # Now insert the real player into the placeholder
                            _game.players[idx] = player
                            player.logger = _game.player_logger
                            player_to_game[player.session_token] = _game.game_id
                            ws_log.info(
                                f"Player {player.name} joined game {data['game_key']}."
                            )
                            await _game.broadcast_to_all(
                                {
                                    "type": "queue_joined",
                                    "num_connected": len(
                                        [
                                            p
                                            for p in _game.players
                                            if p.type == "human" and p.connected
                                        ]
                                    ),
                                    "num_slots": len(
                                        [p for p in _game.players if p.type == "human"]
                                    ),
                                }
                            )
                            break

            # Player has not requested a specific game; is just added to relevant generic queue for their requested
            # game type.
            else:
                waiting_queues[data["num_players"]][data["game_mode"]].append(player)

                ws_log.info(
                    f"Player {data['name']} joined {data['num_players']}-player queue for mode {data['game_mode']}. "
                    f"WebSocket id: {id(ws)}. "
                    f"Queue size: {len(waiting_queues[data['num_players']][data['game_mode']])}. "
                    f"Number of active games: {len(active_games)}"
                )

                await ws.send_json(
                    {
                        "type": "queue_joined",
                        "num_connected": len(
                            waiting_queues[data["num_players"]][data["game_mode"]]
                        ),
                        "num_slots": data["num_players"],
                    }
                )

        # Study participant: assign directly to the first pending slot in the schedule.
        elif data["type"] == "study_join":
            player.identifier = data.get("prolific_id")

            if not schedule:
                await ws.send_json({"type": "no_games_available"})
                ws_log.info(
                    f"Player {data['name']} tried to join study but schedule is empty."
                )
            else:
                study_participants.append(player)
                await ws.send_json(
                    {
                        "type": "queue_joined",
                        "max_wait_seconds": schedule[0].max_waiting_time,
                    }
                )
                ws_log.info(
                    f"Player {data['name']} joined study queue "
                    f"(position {len(study_participants)}). "
                    f"Prolific: {data.get('prolific_id')}"
                )

        # Ping loop: detect dead connections by sending a ping every 10s and
        # expecting a pong within 5s. Closes the WebSocket if none arrives,
        # which triggers the existing disconnect/bot-replacement logic in finally.
        _pong_received = asyncio.Event()
        _pong_received.set()

        async def _ping_loop():
            while True:
                await asyncio.sleep(PING_INTERVAL_SECONDS)
                _pong_received.clear()
                try:
                    await asyncio.wait_for(
                        ws.send_json({"type": "ping"}), timeout=PING_TIMEOUT_SECONDS
                    )
                except Exception:
                    return
                try:
                    await asyncio.wait_for(
                        _pong_received.wait(), timeout=PING_TIMEOUT_SECONDS
                    )
                except asyncio.TimeoutError:
                    ws_log.warning(
                        f"Ping timeout for {player.name if player else 'unknown'}, closing connection"
                    )
                    try:
                        await ws.close(code=1001)
                    except Exception:
                        pass
                    return

        _ping_task = asyncio.create_task(_ping_loop())

        # Keep connection alive and listen for messages
        while True:
            try:
                message = await asyncio.wait_for(ws.receive_json(), timeout=1.0)

                if message["type"] == "pong":
                    _pong_received.set()
                    continue

                # Player has left the queue. If the player is the creator of the game, the game is removed from the
                # list of games and is terminated for all players waiting to join that game. The game key is deleted
                # and will no longer be valid.
                # This does not occur if a non-creating player leaves the queue.
                elif message["type"] == "exit_queue":
                    # Game creator has left the waiting queue: exit game and notify all waiting players
                    # Also remove the game directory, if it was created, as well as all other players
                    if player.session_token in game_creators:
                        # Get the game and remove from all lists
                        _game_id = game_creators[player.session_token]
                        _game = waiting_games.pop(_game_id)
                        game_creators.pop(player.session_token)
                        for p in _game.players:
                            if p.session_token in player_to_game:
                                player_to_game.pop(p.session_token)

                            # Inform frontend
                            await p.send_message(
                                {
                                    "type": "game_cancelled",
                                    "is_creator": p.session_token
                                    == player.session_token,
                                }
                            )

                        # Delete the game's data directory, if created
                        if _game.out_path is not None:
                            import shutil

                            shutil.rmtree(_game.out_path)

                        ws_log.info(f"{player.name} cancelled game {_game_id}.")

                    # Non-creating player has left the waiting queue for a specific game
                    elif player.session_token in player_to_game:
                        _game = waiting_games[player_to_game[player.session_token]]
                        for p in _game.players:
                            if p.session_token == player.session_token:
                                p.connected = False
                                player_to_game.pop(player.session_token)
                                await player.ws.send_json({"type": "quit_confirmed"})
                                p.ws = None
                                break

                        await _game.broadcast_to_all(
                            {
                                "type": "player_exited_queue",
                                "num_connected": len(
                                    [
                                        p
                                        for p in _game.players
                                        if p.connected and p.type == "human"
                                    ]
                                ),
                                "num_slots": len(
                                    [p for p in _game.players if p.type == "human"]
                                ),
                            }
                        )
                        ws_log.info(
                            f"{player.name} left the queue for game {_game.game_id}."
                        )

                    # Study player leaving the queue
                    elif player in study_participants:
                        study_participants.remove(player)
                        ws_log.info(f"{player.name} exited study queue.")

                    # Player was not yet assigned a game in the regular queue
                    else:
                        waiting_queues[data["num_players"]][data["game_mode"]].remove(
                            player
                        )
                        ws_log.info(f"{player.name} exited queue.")

                # Player has quit the game
                elif message["type"] == "quit":
                    player.connected = False
                    ws_log.info(
                        f"Player {player.name} quit game {player_to_game[player.session_token]}"
                    )

                    # Check if game should end
                    game_id = player_to_game[player.session_token]
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

                        player_to_game.pop(player.session_token)

                    # Send confirmation
                    await ws.send_json({"type": "quit_confirmed"})
                    ws_log.info(f"Quit confirmed")

                # Route the message to the correct game
                elif player.session_token in player_to_game:
                    game_id = player_to_game[player.session_token]
                    if game_id in active_games:
                        game = active_games[game_id]
                        await game.handle_message(player, message)
                    else:
                        ws_log.info(f"Game {game_id} no longer active")

                # Unknown message
                else:
                    ws_log.error(
                        f"Message received but player not in any active game: {message}"
                    )

            except asyncio.TimeoutError:
                continue

    except WebSocketDisconnect:
        ws_log.info(f"WebSocket disconnected: {player.name if player else 'Unknown'}")
    except RuntimeError as e:
        # Starlette raises RuntimeError("WebSocket is not connected") when receive_json
        # is called after the socket has already been closed (e.g. by the ping loop).
        # Treat this identically to a clean disconnect so the finally block runs normally.
        ws_log.info(
            f"WebSocket closed unexpectedly for {player.name if player else 'Unknown'}: {e}"
        )
    except Exception as e:
        ws_log.error(f"WebSocket error: {e}")
        traceback.print_exc()
    finally:
        # Cancel the ping task — but do this AFTER populating reconnection_slots so a fast
        # reconnect attempt doesn't arrive during the await and find an empty slot.
        # All synchronous cleanup runs first (no awaits), then we await the ping task.

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
            if player.session_token in player_to_game:
                game_id = player_to_game[player.session_token]
                if game_id in active_games:
                    _game = active_games[game_id]
                    for p in _game.players:
                        if p.session_token == player.session_token:
                            p.connected = False
                            server_log.info(
                                f"Marked {p.name} as disconnected in game {game_id}"
                            )
                            break

                    # Always give a grace period so the player can reconnect.
                    # After the grace period, end the game if all humans are gone
                    # (single-player or everyone left), otherwise replace with a bot.
                    token = getattr(player, "session_token", None)

                    async def _delayed_replace(
                        _p=player, _g=_game, _t=token, _gid=game_id
                    ):
                        await asyncio.sleep(RECONNECT_GRACE_SECONDS)
                        if _p.connected:
                            return
                        still_connected = [
                            p for p in _g.players if p.type == "human" and p.connected
                        ]
                        if not still_connected:
                            ws_log.info(
                                f"All humans disconnected from game {_gid}, ending game."
                            )
                            await _g.handle_message(_p, {"type": "quit"})
                            _g.game_over = True
                        else:
                            server_log.info(
                                f"Grace period expired for {_p.name}, replacing with bot"
                            )
                            await _g.replace_player_with_bot(_p)
                        reconnection_slots.pop(_t, None)

                    task = asyncio.create_task(_delayed_replace())
                    if token:
                        reconnection_slots[token] = {
                            "player": player,
                            "game_id": game_id,
                            "task": task,
                        }
                    server_log.info(
                        f"Marked {player.name} as disconnected in game {game_id}, grace period started"
                    )

                # Remove from player_to_game mapping
                player_to_game.pop(player.session_token)

            # If player was in the study queue, remove them
            if player in study_participants:
                study_participants.remove(player)
                ws_log.info(f"Removed {player.name} from study queue")

            # If player was a game_creator, remove from dictionary but keep the game they created for one hour
            # (so people can still join using the key)
            if player.session_token in game_creators.keys():
                game_creators.pop(player.session_token)

        # Cancel ping task now that reconnection_slots is populated (avoids the race where
        # a fast reconnect arrives during this await and finds an empty slot).
        if _ping_task is not None:
            _ping_task.cancel()
            try:
                await _ping_task
            except asyncio.CancelledError:
                pass


## ---------------------------------------------------------------------------------------------------------------------
## Survey endpoint
## ---------------------------------------------------------------------------------------------------------------------


class SurveyRequest(BaseModel):
    prolific_id: str
    game_id: str | None = None
    survey: Dict


@app.post("/api/survey")
async def submit_survey(req: SurveyRequest):
    # Save into the game's players/ folder if we know where it is;
    # fall back to game_data/surveys/ if the game_id is unknown or had no out_dir.
    out_path = game_out_paths.get(req.game_id) if req.game_id else None
    if out_path:
        save_dir = Path(out_path) / "surveys"
    else:
        save_dir = Path(__file__).parent.parent / "game_data" / "surveys"
    save_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{req.prolific_id}.json"

    payload = {
        "prolific_id": req.prolific_id,
        "game_id": req.game_id,
        "submitted_at": datetime.now().isoformat(),
        "survey": req.survey,
    }

    with open(save_dir / filename, "w") as f:
        json.dump(payload, f, indent=2)

    server_log.info(f"Survey saved for {req.prolific_id} → {save_dir / filename}")
    return {"status": "ok"}


## ---------------------------------------------------------------------------------------------------------------------
## Participant tracking endpoints
## ---------------------------------------------------------------------------------------------------------------------


class ParticipantRequest(BaseModel):
    prolific_id: str
    tutorial_done: bool | None = None
    game_assigned: bool | None = None


@app.post("/api/participant")
async def upsert_participant(req: ParticipantRequest):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO participants (prolific_id) VALUES (?)",
            (req.prolific_id,),
        )
        if req.tutorial_done is not None:
            await db.execute(
                "UPDATE participants SET tutorial_done = ? WHERE prolific_id = ?",
                (int(req.tutorial_done), req.prolific_id),
            )
        if req.game_assigned is not None:
            await db.execute(
                "UPDATE participants SET game_assigned = ? WHERE prolific_id = ?",
                (int(req.game_assigned), req.prolific_id),
            )
        await db.commit()
        async with db.execute(
            "SELECT tutorial_done, game_assigned FROM participants WHERE prolific_id = ?",
            (req.prolific_id,),
        ) as cursor:
            row = await cursor.fetchone()

    return {
        "prolific_id": req.prolific_id,
        "tutorial_done": bool(row[0]),
        "game_assigned": bool(row[1]),
    }


## ---------------------------------------------------------------------------------------------------------------------
## Admin panel
## ---------------------------------------------------------------------------------------------------------------------


def _check_admin(x_admin_password: str = Header(None)):
    if not ADMIN_PASSWORD:
        raise HTTPException(
            status_code=403, detail="Admin panel disabled (ADMIN_PASSWORD not set)"
        )
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    html_path = Path(__file__).parent / "admin.html"
    return HTMLResponse(content=html_path.read_text())


@app.get("/api/admin/status")
async def admin_status(x_admin_password: str = Header(None)):
    _check_admin(x_admin_password)

    # Schedule summary
    sched_info = [
        {
            "note": slot.config.get("game", {}).get("note") or slot.config.get("note"),
            "num_humans": slot.num_humans,
            "max_waiting_time": slot.max_waiting_time,
        }
        for slot in schedule
    ]

    # Waiting queue
    queue_info = [
        {"name": p.name, "prolific_id": getattr(p, "identifier", None)}
        for p in study_participants
    ]

    # Active games
    games_info = [
        {
            "game_id": game_id,
            "num_players": len(game.players),
            "round": getattr(game, "round", None),
        }
        for game_id, game in active_games.items()
    ]

    # DB stats
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT COUNT(*), SUM(tutorial_done), SUM(game_assigned) FROM participants"
        ) as cur:
            row = await cur.fetchone()
    db_stats = {
        "total": row[0] or 0,
        "tutorial_done": row[1] or 0,
        "game_assigned": row[2] or 0,
    }

    return {
        "schedule": sched_info,
        "queue": queue_info,
        "active_games": games_info,
        "db_stats": db_stats,
    }


@app.post("/api/admin/reload")
def admin_reload(x_admin_password: str = Header(None)):
    _check_admin(x_admin_password)
    global schedule
    new_slots = build_schedule()
    added = len(new_slots)
    schedule = new_slots
    server_log.info(f"Admin reloaded schedule: {added} slots")
    return {
        "message": f"Schedule replaced: {added} slot{'s' if added != 1 else ''} loaded"
    }


## ---------------------------------------------------------------------------------------------------------------------
## ---------------------------------------------------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--port", type=int, default=5050
    )  # Port 3000 is reserved for AirPlay on macOS
    args = parser.parse_args()

    from hypercorn.asyncio import serve
    from hypercorn.config import Config

    config = Config()
    config.bind = [f"0.0.0.0:{args.port}"]

    # 'app' is your Quart instance
    asyncio.run(serve(app, config))
