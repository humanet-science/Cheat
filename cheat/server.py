from fastapi import FastAPI, WebSocket,WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from cheat.game import CheatGame
from cheat.random_bot import RandomBot
import asyncio
import json

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
    global game, bot, clients
    game = CheatGame(num_players=2)
    bot = RandomBot()
    #clients = []

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

    # Assign player_id - only allow as many clients as there are players
    player_id = len(clients)

    await ws.send_json({"type": "state", "state": make_state(player_id)})
    clients.append(ws)

    try:
        while True:

            data = await ws.receive_json()
            print(data, game.turn)
            if data["type"] == "new_game":
                print("Starting a new game")
                reset_game()
                for i, client in enumerate(clients):
                    await client.send_json({
                        "type": "state",
                        "state": make_state(i)
                    })
            elif data["type"] == "play":
                declared_rank = data["declared_rank"]
                cards = data["cards"]
                game.play_turn(game.turn, declared_rank, cards)
                game.next_player()

            elif data["type"] == "call":
                result = game.call_bluff(game.turn)
                print(f'Result of call: {result}')
                await broadcast({"type": "result", "result": result})

                # Check who picks up the pile to determine who goes next
                if f"Player {game.turn} picks up" in result:
                    # Caller was wrong: misses a turn
                    await check_for_fours()
                    game.next_player()
                else:
                    # Bluff was successful - caller goes next
                    await check_for_fours()
                    print(f"successful call by player {game.turn}. Game turn is {game.turn}")

                # Send updated state to all clients after bluff
                for i, client in enumerate(clients):
                    try:
                        await client.send_json({
                            "type": "state_update",
                            "state": make_state(i)
                        })
                    except Exception as e:
                        print(f"Error sending to client {i}: {e}")

            winner = game.game_over()
            if winner is not None:
                await broadcast({"type": "game_over", "winner": winner})
                continue
            await process_bot_turn()

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

async def check_for_fours():

    # Check if four of a kind can be discarded
    msg = game.four_of_a_kind_check(game.turn)
    print("Checking for four of a kind", msg)
    if msg:
        await broadcast({"type": "result", "result": msg})
        # Send updated state to all clients
        for i, client in enumerate(clients):
            await client.send_json({"type": "state_update", "state": make_state(i)})
        await asyncio.sleep(1.5)

async def process_bot_turn():

    # Let the bot move if it’s their turn
    if game.turn == 1:  # assume player 0 = human, 1 = bot
        await asyncio.sleep(1)
        await check_for_fours()
        action = bot.choose_action(game, game.turn)
        print(f"Bot (player {game.turn}) is playing", action)
        if action[0] == "play":
            _, rank, cards = action
            game.play_turn(game.turn, rank, cards)
            game.next_player()
        elif action[0] == "call":
            result = game.call_bluff(game.turn)
            await broadcast({"type": "result", "result": result})
            if f"Player {game.turn} picks up" in result:
                # Caller was wrong: misses a turn
                await check_for_fours()
                game.turn = game.next_player()
            else:
                # Bluff was successful - caller's turn and a new round can start
                print(f"Successful call by player {game.turn}. Game turn is {game.turn}")
                game.current_rank = None
                _, rank, cards = bot.start_play(game, game.turn)
                print(f"Bot (player {game.turn}) is playing: ('play', {rank}, {cards})")
                await check_for_fours()
                game.play_turn(game.turn, rank, cards)
                game.next_player()

        # Send personalized state to each client
        for i, client in enumerate(clients):
            try:
                await client.send_json({
                    "type": "state_update",
                    "state": make_state(i)
                })
            except Exception as e:
                print(f"Error sending to client {i}: {e}")

if __name__ == "__main__":
    import argparse
    import asyncio

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5050)
    args = parser.parse_args()

    from hypercorn.asyncio import serve
    from hypercorn.config import Config

    config = Config()
    config.bind = [f"0.0.0.0:{args.port}"]

    # 'app' is your Quart instance
    asyncio.run(serve(app, config))