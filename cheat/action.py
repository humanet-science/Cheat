from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from datetime import datetime

# General Action class that logs an action
@dataclass
class GameAction:
    type: str | None
    player_id: int | None = None
    timestamp: datetime | None = None
    data: Any = None

    def __eq__(self, other):
        """ Equality check; timestamps are irrelevant """
        return self.type == other.type and self.player_id == other.player_id and self.data == other.data

    def __str__(self):

        """ Converts an action into a descriptive string for LLM integration while masking out hidden information"""
        if self.type == 'play':
            return f"Player {self.player_id} plays {len(self.data['cards_played'])} {'cards' if len(self.data['cards_played']) > 1 else 'card'}, declaring {self.data['declared_rank']}."
        elif self.type == 'call':
            if self.data['was_lying']:
                return f"Player {self.player_id} successfully calls the last play; Player {self.data['accused_id']} had played {self.data['revealed_cards']}."
            else:
                return f"Player {self.player_id} unsuccessfully calls the last play; Player {self.data['accused_id']} was telling the truth."
        elif self.type == 'pick_up':
            return f"Player {self.player_id} picks up the pile."
        elif self.type == 'discard':
            return f"Player {self.player_id} discards {', '.join(self.data)}."
        elif self.type == 'win':
            return f"Player {self.player_id} wins the round!"
        elif self.type in ['bot_message', 'human_message']:
            return f"Player {self.player_id} broadcasts: '{self.data}'"
        elif self.type == 'player_exit':
            return f"Player {self.player_id} has left the game."
        elif self.type == 'player_replacement':
            return f"Player {self.player_id} has been replaced by a bot."
        elif self.type == 'new_round':
            return f"Start of a new round (round number {self.data['round']})."
        elif self.type == 'game_over':
            return f"Game is over."
        # LLM responses are for debugging purposes only
        elif self.type == 'LLM_response':
            return ""
        # LLM failures are logged
        elif self.type == 'failure':
            return f"Player {self.player_id} was forced to leave the game due to: {self.data['reason']}."
        return f"Action type: {self.type}, player: {self.player_id}; data: {self.data}"
