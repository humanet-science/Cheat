from fastapi import FastAPI, WebSocket,WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from cheat.game import CheatGame
from cheat.random_bot import RandomBot
import yaml

from pathlib import Path

# Path to configuration file, located in root
game_config_path = Path(__file__).parent.parent / "config.yaml"
with open(game_config_path, "r") as f:
    game_config = yaml.safe_load(f)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

game = CheatGame(num_players=2)
bot = RandomBot()
clients = []

def reset_game():
    global game, bots, clients
    num_players = game_config['game']['num_players']
    game = CheatGame(num_players=num_players)

    # Create bots based on config (currently only one human player, rest are bots)
    bots = []
    for bot_config in game_config['bots']:
        if bot_config['type'] == "RandomBot":
            bots.append(RandomBot(
                p_call=bot_config.get('p_call', 0.3),
                p_lie=bot_config.get('p_lie', 0.3)
            ))

# Initialize on startup
reset_game()

def make_state(player_id):
    return {
        "hands": [len(h) for h in game.players],
        "pile_size": len(game.pile),
        "currentPlayer": game.turn,
        "yourId": player_id,
        "yourHand": [str(card) for card in game.players[player_id]], # Convert cards to strings to make JSON serialisable
        "currentRank": game.current_rank
    }

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):

    await ws.accept()

    # Assign player_id, only allowing for one human player
    player_id = len(clients)

    await ws.send_json({"type": "state", "state": make_state(player_id)})
    clients.append(ws)

    # Check if game is over
    game_is_over = False

    try:
        while True:

            # Receive data from frontend
            data = await ws.receive_json()
            print(data, game.turn)

            if data["type"] == "new_game":
                print("Starting a new game")
                reset_game()
                game_is_over = False  # Reset the flag
                for i, client in enumerate(clients):
                    await client.send_json({
                        "type": "state",
                        "state": make_state(i)
                    })
                continue

            if game_is_over:
                continue

            # Card has been played
            elif data["type"] == "play":
                declared_rank = data["declared_rank"]
                cards = data["cards"]

                # Check for win
                winner = game.check_winner(game.turn)
                if winner is not None:
                    await broadcast({"type": "game_over", "winner": winner})
                    game_is_over = True
                    continue

                # No winner -- continue game
                game.play_turn(game.turn, declared_rank, cards)

                # Broadcast the play
                await broadcast({
                    "type": "card_played",
                    "player_id": game.turn,
                    "num_players": game.num_players,
                    "cards": cards,
                    "declared_rank": declared_rank,
                    "card_count": len(cards),
                    "yourId": player_id,
                })

                # Move to next player
                game.next_player()

                for i, client in enumerate(clients):
                    await client.send_json({
                        "type": "state",
                        "state": make_state(i)
                    })

            # Calling a bluff
            elif data["type"] == "call":

                # Get the last play before calling bluff
                last_player, declared_rank, cards_played = game.history[-1]
                caller_id = game.turn

                # Result of the call
                result = game.call_bluff(game.turn)
                print(f'Result of call: {result}')

                # Check who picks up the pile to determine who goes next
                if f"Player {game.turn} picks up" in result:
                    # Caller was wrong: misses a turn
                    game.next_player()
                    was_lying = False
                else:
                    # Bluff was successful -- caller goes next
                    print(f"successful call by player {game.turn}. Game turn is {game.turn}")
                    was_lying = True

                # Broadcast bluff result with revealed cards
                await broadcast({
                    "type": "bluff_called",
                    "caller_id": caller_id,
                    "accused_id": last_player,
                    "declared_rank": declared_rank,
                    "actual_cards": [str(c) for c in cards_played],  # The actual cards that were played
                    "was_lying": was_lying,
                    "result": result,
                    "yourId": player_id,
                })

                # Whoever picked up cards does a four-of-a-kind check
                if was_lying:
                    await check_for_fours(last_player)
                else:
                    await check_for_fours(player_id)

                # Send updated state to all clients after bluff
                for i, client in enumerate(clients):
                    try:
                        await client.send_json({
                            "type": "state_update",
                            "state": make_state(i)
                        })
                    except Exception as e:
                        print(f"Error sending to client {i}: {e}")

            # Human turn is done - move to bots
            game_is_over = await process_bot_turn()

    except WebSocketDisconnect:
        print(f"Client {player_id} disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if ws in clients:
            clients.remove(ws)
        # Reset game when all clients disconnect
        if len(clients) == 0:
            reset_game()

async def broadcast(message):
    for c in clients:
        await c.send_json(message)

async def check_for_fours(_player_id: int = None):

    # Check if four of a kind can be discarded: by default, this is the current player, but can also be the previous
    # player.
    _player_id = game.turn if _player_id is None else _player_id
    msg = game.four_of_a_kind_check(_player_id)
    print(f"Checking for four of a kind for player {_player_id}; result: {msg}.")
    if msg:
        await broadcast({"type": "discard", "result": msg})
        # Send updated state to all clients
        for i, client in enumerate(clients):
            await client.send_json({"type": "state_update", "state": make_state(i)})

async def process_bot_turn():

    # Let the bots play
    while game.turn > 0 and game.turn < len(game.players):

        print(f'Current turn: {game.turn}')
        await check_for_fours()

        bot_id = game.turn
        bot = bots[bot_id - 1]

        action = bot.choose_action(game, game.turn)
        print(f"Bot (id {bot_id}, game turn {game.turn}) is playing", action)

        # Bot playing
        if action[0] == "play":

            # Check for win
            winner = game.check_winner(game.turn)
            if winner is not None:
                await broadcast({"type": "game_over", "winner": winner})
                return True

            _, declared_rank, cards = action
            game.play_turn(game.turn, declared_rank, cards)

            # Broadcast the play with actual cards
            await broadcast({
                "type": "card_played",
                "num_players": game.num_players,
                "player_id": game.turn,
                "cards": [str(c) for c in cards],
                "declared_rank": declared_rank,
                "card_count": len(cards),
            })

            game.next_player()

            # Send updated state to all clients
            for i, client in enumerate(clients):
                await client.send_json({"type": "state_update", "state": make_state(i)})

        elif action[0] == "call":

            # Get the last play before calling bluff
            last_player, declared_rank, cards_played = game.history[-1]

            result = game.call_bluff(game.turn)

            if f"Player {game.turn} picks up" in result:
                # Caller was wrong: misses a turn
                game.turn = game.next_player()
                was_lying = False
            else:
                # Bluff was successful - caller goes next
                print(f"Successful call by bot {bot_id}. Game turn is {game.turn}")
                game.turn = bot_id  # Set turn to the caller
                game.current_rank = None  # New round starts
                was_lying = True

            # Broadcast bluff result
            await broadcast({
                "type": "bluff_called",
                "caller_id": bot_id,
                "accused_id": last_player,
                "declared_rank": declared_rank,
                "actual_cards": [str(c) for c in cards_played],
                "was_lying": was_lying,
                "result": result
            })

            # Whoever picked up cards does a four-of-a-kind check
            if was_lying:
                await check_for_fours(last_player)
            else:
                await check_for_fours(bot_id)

            # Send state update after bluff
            for i, client in enumerate(clients):
                try:
                    await client.send_json({
                        "type": "state_update",
                        "state": make_state(i)
                    })
                except Exception as e:
                    print(f"Error sending to client {i}: {e}")

            # The bluff was successful, they now play
            if was_lying:

                # Check for win
                winner = game.check_winner(game.turn)
                if winner is not None:
                    await broadcast({"type": "game_over", "winner": winner})
                    continue

                _, rank, cards = bot.start_play(game, game.turn)
                print(f"Bot (player {bot_id}) is playing after successful call: ('play', {rank}, {cards})")
                game.play_turn(game.turn, rank, cards)

                # Broadcast the bot's play
                await broadcast({
                    "type": "card_played",
                    "num_players": game.num_players,
                    "player_id": bot_id,
                    "cards": [str(c) for c in cards],
                    "declared_rank": rank,
                    "card_count": len(cards)
                })

                game.next_player()

                # Send updated state to all clients
                for i, client in enumerate(clients):
                    await client.send_json({"type": "state_update", "state": make_state(i)})

    # Send final state updates after all bots finish
    for i, client in enumerate(clients):
        try:
            await client.send_json({
                "type": "state_update",
                "state": make_state(i)
            })
        except Exception as e:
            print(f"Error sending to client {i}: {e}")

    return False

if __name__ == "__main__":
    import argparse
    import asyncio

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5050) # Port 3000 is reserved for AirPlay on macOS
    args = parser.parse_args()

    from hypercorn.asyncio import serve
    from hypercorn.config import Config

    config = Config()
    config.bind = [f"0.0.0.0:{args.port}"]

    # 'app' is your Quart instance
    asyncio.run(serve(app, config))