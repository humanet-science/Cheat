from dataclasses import dataclass, fields
from datetime import datetime
from typing import Any


# General Action class that logs an action
@dataclass
class GameAction:
    type: str | None
    player_id: int | None = None
    timestamp: datetime | None = None
    data: Any = None

    @classmethod
    def from_dict(cls, **kwargs):
        valid = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in kwargs.items() if k in valid})

    def __eq__(self, other):
        """Equality check; timestamps are irrelevant"""
        return (
            self.type == other.type
            and self.player_id == other.player_id
            and self.data == other.data
        )

    def __str__(self, *, speaker_id: int = None, speaker_types: dict = None):
        """Converts an action into a descriptive string for LLM integration while masking out hidden information.
        If specified, the speaker types can be added (e.g. 'bot' or 'human'). These are added from a dictionary
        rather than the log itself to allow for controlled manipulation."""

        # Helper function to get the right pronoun
        def get_player_ref(pid):
            ref = (
                "You"
                if speaker_id is not None and pid == speaker_id
                else f"Player {pid}"
            )
            # Add the speaker type, if specified
            if speaker_types is not None:
                ref += f" ({speaker_types[pid]})"
            return ref

        if self.type == "play":
            player_ref = get_player_ref(self.player_id)
            card_word = "cards" if len(self.data["cards_played"]) > 1 else "card"
            return (
                f"{player_ref} play{' ' if 'You' in player_ref else 's '}{len(self.data['cards_played'])} {card_word},"
                f" declaring {self.data['declared_rank']} (Pile size: {self.data['pile_size']})."
            )

        elif self.type == "call":
            player_ref = get_player_ref(self.player_id)
            accused_ref = get_player_ref(self.data["accused_id"])

            if self.data["was_lying"]:
                if "You" in player_ref:
                    return f"You successfully call the last play: {accused_ref} had played {self.data['revealed_cards']}."
                else:
                    return f"{player_ref} successfully calls the last play: {accused_ref} had played {self.data['revealed_cards']}."
            else:
                if "You" in player_ref:
                    return f"You unsuccessfully call the last play: {accused_ref} was telling the truth."
                else:
                    return f"{player_ref} unsuccessfully calls the last play: {accused_ref} was telling the truth."

        elif self.type == "pick_up":
            player_ref = get_player_ref(self.player_id)
            return (
                f"{player_ref} pick{' up' if 'You' in player_ref else 's up'} the pile."
            )

        elif self.type == "discard":
            player_ref = get_player_ref(self.player_id)
            cards_str = ", ".join(self.data)
            return f"{player_ref} discard{' ' if 'You' in player_ref else 's '}{cards_str}."

        elif self.type == "win":
            player_ref = get_player_ref(self.player_id)
            return f"{player_ref} win{' the round!' if 'You' in player_ref else 's the round!'}"

        elif self.type in ["bot_message", "human_message"]:
            player_ref = get_player_ref(self.player_id)
            return f"{player_ref} broadcast{'s' if player_ref.startswith('Player') else ''}: '{self.data}'"

        elif self.type == "player_exit":
            player_ref = get_player_ref(self.player_id)
            return (
                f"{player_ref} ha{'ve' if 'You' in player_ref else 's'} left the game."
            )

        elif self.type == "player_replacement":
            player_ref = get_player_ref(self.player_id)
            return f"{player_ref} ha{'ve' if 'You' in player_ref else 's'} been replaced by a bot."

        elif self.type == "new_round":
            return f"Start of a new round (round number {self.data['round']})."

        elif self.type == "game_over":
            return f"Game is over."

        # LLM responses for debugging purposes only
        elif self.type in ["LLM_response", "invalid_LLM_response"]:
            return ""

        return f"Action type: {self.type}, player: {self.player_id}; data: {self.data}"
