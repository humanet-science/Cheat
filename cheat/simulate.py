from cheat.game import CheatGame
from cheat.random_bot import RandomBot

def run_game():
    game = CheatGame(num_players=3)
    bots = [RandomBot() for _ in range(3)]

    while not game.game_over():
        player = game.turn
        bot = bots[player]

        action = bot.choose_action(game, player)
        if action[0] == "play":
            _, rank, cards = action
            game.play_turn(player, rank, cards)
            print(f"Player {player} plays {len(cards)} cards claiming {rank}.")
            game.four_of_a_kind_check(player)
            game.next_player()
        elif action[0] == "call":
            result = game.call_bluff(player)
            print(result)
            game.next_player()

        winner = game.game_over()
        if winner is not None:
            print(f"Player {winner} wins!")
            break

if __name__ == "__main__":
    run_game()
