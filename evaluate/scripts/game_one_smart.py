import argparse
import asyncio
import tqdm

from ..utils import setup_game


async def main(p_lie, p_call, n_rounds=10):

    # Set up the game with a single random bot and three smart bots
    game_one_random = setup_game({"players": [
        {"type": "SmartBot", "id": 0, "name": "SmartBot_1", "verbosity": 0.0},
        {"type": "RandomBot", "id": 1, "name": "RandomBot_1", "p_lie": p_lie, "p_call": p_call, "verbosity": 0.0},
        {"type": "RandomBot", "id": 2, "name": "RandomBot_2", "p_lie": p_lie, "p_call": p_call, "verbosity": 0.0},
        {"type": "RandomBot", "id": 3, "name": "RandomBot_3", "p_lie": p_lie, "p_call": p_call, "verbosity": 0.0},
    ]}, out_dir='game_data', note=f'one_smart_p_lie_{p_lie}_p_call_{p_call}')

    # Play n_rounds
    for i in tqdm.trange(n_rounds):
        await game_one_random.play_round(sleep_pause=0)
        if i < n_rounds - 1:
            game_one_random.new_round()
        else:
            game_one_random.game_over = True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--p_lie", type=float, default=0.1)
    parser.add_argument("--p_call", type=float, default=0.1)
    parser.add_argument("--n_rounds", type=int, default=10)
    args = parser.parse_args()

    asyncio.run(main(args.p_lie, args.p_call, args.n_rounds))