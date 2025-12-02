from cheat.card import str_to_Card
from cheat.player import Player
from typing import Callable
import re

class LLM_Player(Player):
    """ Random bot that inherits from the parent Player class"""

    def __init__(self, id: int | None, name: str, avatar: str, input_function: Callable, init_prompt: str):
        super().__init__(id=id, name=name, avatar=avatar, type="LLM")
        self.input_function = input_function

        # Initialise the LLM with a starting prompt
        input_response = self.input_function(init_prompt)
        if input_response != 'ok':
            raise Exception(f"LLM responded {input_response} to initial prompt!")

    def make_move(self, game):
        """ Ask the LLM to make a move """

        # Summarise the actions since the LLM last played
        if self.action_idx:
            game_summary = '\n'.join([f"- {str(action)}" for action in game.history[self.action_idx[-1]:]])
        else:
            game_summary = f'- Start of the game, the pile is empty, and no rank has been declared. Your player id is: {self.id} \n'
            game_summary += '\n'.join([f"- {str(action)}" for action in game.history])
        if game.turn == self.id:
            game_summary += f"\n- It's your turn. The hand sizes of the other players: {'; '.join([f'Player {player.id}: {len(player.hand)} card(s)' for player in game.players if player.id != self.id])}, "
            game_summary += f"and your hand is {[str(c) for c in self.hand]}."
        if game.current_rank is not None:
            game_summary += f" The current declared rank is {game.current_rank}."

        # Pass to LLM and request a sponse
        response = self.input_function(game_summary)

        # Return response
        if response.lower() == 'call':
            return ('call', )
        else:
            pattern = r"Play \[(.*?)\](?:; Declare (.+))?"
            match = re.match(pattern, response)
            if match:
                return ('play', match.group(2) if match.group(2) is not None else game.current_rank, [str_to_Card(card.strip().strip("'\"")) for card in match.group(1).split(',')])

    def choose_action(self, game) -> tuple:
        """ Pass-through; required for interface compatibility with bot players"""
        return self.make_move(game)

    def broadcast_message(self, game, type: str = None, *_, **__):
        """ Broadcast an opinion based on the state of play"""
        pass
