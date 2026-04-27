import os
import pickle
import random
import re
from datetime import datetime
from typing import Literal

from cheat.action import GameAction
from cheat.card import RANKS, SUITS, WORD_TO_RANK, WORD_TO_SUIT, Card, str_to_Card
from cheat.player import Player

from .bot_messages import generate_comment

SUPPORTED_CLIENTS = ["open_ai", "gemini", "deepseek"]


class MissingAPIKeyError(Exception):
    """Exception raised when an API key is missing."""

    pass


def get_client(kind: Literal["open_ai", "gemini", "deepseek"]):
    """Set up the client connection for various kinds of LLM."""
    if kind == "gemini":
        if "GEMINI_API_KEY" not in os.environ.keys():
            raise MissingAPIKeyError(
                "Missing API key for OpenAI! Add 'GEMINI_API_KEY' to your os.environ keys!"
            )
        from google import genai

        return genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    if kind == "open_ai":
        if "OPENAI_API_KEY" not in os.environ.keys():
            raise MissingAPIKeyError(
                "Missing API key for OpenAI! Add 'OPENAI_API_KEY' to your os.environ keys!"
            )
        from openai import OpenAI

        return OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    if kind == "deepseek":
        from openai import OpenAI

        if "DEEPSEEK_API_KEY" not in os.environ.keys():
            raise MissingAPIKeyError(
                "Missing API key for Deepseek! Add 'DEEPSEEK_API_KEY' to your os.environ keys!"
            )
        return OpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"], base_url="https://api.deepseek.com"
        )
    else:
        raise ValueError(
            f"Unkown client {kind}! Choose from {','.join(SUPPORTED_CLIENTS)}."
        )


def generate_client_input(
    kind, *, system_prompt, game_summary, additional_prompts: str = None
) -> dict:
    if kind == "deepseek":
        res = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": game_summary},
        ]
        if additional_prompts:
            res.append({"role": "system", "content": additional_prompts})
        return dict(messages=res)

    elif kind == "open_ai":
        res = [
            {"role": "developer", "content": system_prompt},
            {"role": "user", "content": game_summary},
        ]
        if additional_prompts:
            res.append({"role": "developer", "content": additional_prompts})
        return dict(input=res)

    elif kind == "gemini":
        from google.genai import types

        if additional_prompts:
            res = dict(
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt
                    + f" Remember: {additional_prompts}.",
                    thinking_config=types.ThinkingConfig(thinking_level="minimal"),
                ),
                contents=game_summary,
            )
        else:
            res = dict(
                config=types.GenerateContentConfig(system_instruction=system_prompt),
                contents=game_summary,
            )
        return res

    else:
        raise ValueError(
            f"Unkown client {kind}! Choose from {','.join(SUPPORTED_CLIENTS)}."
        )


def input_to_client(client, kind, **model_kwargs):
    if kind == "gemini":
        return client.models.generate_content(**model_kwargs).text

    if kind == "open_ai":
        return client.responses.create(**model_kwargs).output_text

    if kind == "deepseek":
        return client.chat.completions.create(**model_kwargs).choices[0].message.content
    else:
        raise ValueError(
            f"Unkown client {kind}! Choose from {','.join(SUPPORTED_CLIENTS)}."
        )


def convert_LLM_response(game, response: str, *, player_id: int = None) -> GameAction:
    """Converts an LLM response to a playable move which can be passed to the game. This catches quite a lot of different
    input cases that are tested."""

    # Normalize the response
    normalized_response = response.strip().lower()

    # Check for a call
    if "call" in normalized_response:
        return GameAction(type="call", player_id=player_id, data={})

    # Check for a play
    elif "play" in normalized_response:
        # First, extract declaration using different patterns
        declare_patterns = [
            r"declare\s+(\w+)",
            r"declaring\s+(\w+)",
            r"declare:\s*(\w+)",
            r"declare\s+(\w+)$",  # At end of string
        ]

        declare_str = ""
        cards_part = normalized_response

        for pattern in declare_patterns:
            match = re.search(pattern, normalized_response)
            if match:
                declare_str = match.group(1).lower()
                # Remove declaration part to get cards only
                cards_part = normalized_response[: match.start()]
                break

        # Determine declaration rank
        declare_rank = game.current_rank  # default
        if declare_str:
            if declare_str.endswith("s"):
                declare_str = declare_str[:-1]
            if declare_str in WORD_TO_RANK:
                declare_rank = WORD_TO_RANK[declare_str]
            else:
                rank_match = re.match(r"([2-9JQKA]|10)", declare_str.upper())
                if rank_match:
                    declare_rank = rank_match.group(1)

        # Now parse cards from cards_part (everything before declaration and after play (case insensitive))
        play_pattern = r"play\s+(.+)$"
        play_match = re.search(play_pattern, cards_part, re.IGNORECASE)
        if play_match:
            cards_part = play_match.group(1).strip()
        cards_to_play = []

        # Method 1: Word format cards (two of hearts, eight spades)
        rank_words = "|".join(list(WORD_TO_RANK.keys()) + list(WORD_TO_RANK.values()))
        suit_words = "|".join(list(WORD_TO_SUIT.keys()) + list(WORD_TO_SUIT.values()))
        word_pattern = rf"({rank_words})\s*(?:of\s+)?({suit_words})"

        word_matches = re.findall(word_pattern, cards_part, re.IGNORECASE)
        for rank_word, suit_word in word_matches:
            if rank_word.upper() in RANKS:
                rank = rank_word.upper()
            else:
                rank = WORD_TO_RANK.get(rank_word)
            if suit_word in SUITS:
                suit = suit_word
            else:
                suit = WORD_TO_SUIT.get(suit_word)
            card_str = f"{rank}{suit}"
            cards_to_play.append(str_to_Card(card_str))

        # Method 2: Standard format (2♥, 10♠, etc.) if word format didn't find anything
        card_pattern = r"([2-9JQKA]|10)[♥♦♠♣]"
        card_matches = re.findall(card_pattern, cards_part)
        for card_rank in card_matches:
            card_match = re.search(f"{re.escape(card_rank)}[♥♦♠♣]", cards_part)
            if card_match:
                card_str = card_match.group(0)

                # Only add missing cards that have not yet been found
                if str_to_Card(card_str) not in cards_to_play:
                    cards_to_play.append(str_to_Card(card_str))

        return GameAction(
            type="play",
            player_id=player_id,
            data=dict(declared_rank=declare_rank, cards_played=cards_to_play),
        )

    # Failure to extract anything results in an empty action
    return GameAction(type=None, player_id=player_id, data={})


def is_valid_move(move: GameAction, game, hand: list[Card]) -> tuple[bool, str]:
    """Checks if a proposed move is valid, and if not, returns False and an explainer string"""

    if move.type is None or move.type not in ["play", "call"]:
        return False, "You must declare a valid move type ('Play' or 'Call')."
    if move.type != "call" and move.data is None:
        return (
            False,
            "When playing, you must select up to 3 cards to play from your hand.",
        )
    if move.type != "play" and game.current_rank is None:
        return (
            False,
            "You must select between one and three cards to play from your hand and declare a rank.",
        )
    if move.type == "play":
        # No rank declared
        if move.data.get("declared_rank") is None and game.current_rank is None:
            return False, "You must play and declare a rank."

        # Declared rank does not match game rank
        if (
            move.data.get("declared_rank") is not None
            and game.current_rank is not None
            and move.data.get("declared_rank") != game.current_rank
        ):
            return (
                False,
                f"You cannot declare a different rank from the one current being played; current rank is: {game.current_rank}",
            )

        # Cards not in hand
        if not all([c in hand for c in move.data.get("cards_played", [])]):
            return False, f"You can only play cards you currently hold."

        # Declared rank is an Ace
        if move.data.get("declared_rank") == "A":
            return False, "You cannot declare Aces."

        # More than three cards played
        if (
            len(move.data.get("cards_played", [])) == 0
            or len(move.data.get("cards_played", [])) > 3
        ):
            return (
                False,
                "You must select between one and three cards to play from your hand.",
            )

    return True, ""


class LLM_Player(Player):
    """Random bot that inherits from the parent Player class"""

    def __init__(
        self,
        id: int | None = None,
        name: str | None = None,
        display_name: str | None = None,
        avatar: str | None = None,
        system_prompt: str | None = None,
        speaker_types: dict | None = None,
        verbosity: float = 0.2,
        kind: Literal["open_ai", "gemini", "deepseek"] = "deepseek",
        display_type: str | None = None,
        model_kwargs: dict = {},
    ):
        super().__init__(
            id=id,
            name=name,
            display_name=display_name,
            avatar=avatar,
            type="LLM",
            display_type=display_type,
        )
        self.client = get_client(kind)
        self.system_prompt = system_prompt
        self.kind = kind
        self.model_kwargs = model_kwargs
        self.speaker_types = speaker_types
        self.verbosity = verbosity

    def __dict__(self):
        return dict(
            id=self.id,
            name=self.name,
            avatar=self.avatar,
            type=self.type,
            kind=self.kind,
            system_prompt=self.system_prompt,
        )

    def write_info(self, path) -> None:
        """Write out the internal configuration"""

        # TODO: Use json instead
        with open(
            f"{path}/Player_{self.id if self.id is not None else self.name}.pickle",
            "wb",
        ) as file:
            res = self.__dict__()
            pickle.dump(res, file)

    def game_summary(self, game) -> tuple[str, str]:
        """Return a summary of the game that can be passed to the LLM"""

        game_summary = "Here is the game history so far; analyse it in order to decide what to play:\n"
        summary = []
        for action in game.history:
            action_str = action.__str__(
                speaker_id=self.id, speaker_types=self.speaker_types
            )
            if action_str != "":
                summary.append(action_str)
        game_summary += "\n".join(summary)

        play_prompt = ""
        if game.turn == self.id:
            play_prompt += f"\n- It's your turn. The hand sizes of the other players: {'; '.join([f'Player {player.id}: {len(player.hand)} card(s)' for player in game.players if player.id != self.id])}, "
            play_prompt += f"and your hand is {[str(c) for c in self.hand]}."
        if game.current_rank is not None:
            play_prompt += f" The current declared rank is {game.current_rank}."
        play_prompt += "\n What is your move?"

        return game_summary, play_prompt

    def move_from_LLM_response(
        self, game, *, additional_prompts: str = ""
    ) -> GameAction:
        """Passes the input prompt to the LLM and extracts the move."""
        game_summary, play_prompt = self.game_summary(game)
        if additional_prompts:
            play_prompt += f"\nRemember: {additional_prompts}."
        input_data = generate_client_input(
            self.kind,
            game_summary=game_summary,
            system_prompt=self.system_prompt,
            additional_prompts=play_prompt,
        )
        response = input_to_client(
            kind=self.kind, client=self.client, **input_data, **self.model_kwargs
        )

        # Log the response
        game.player_logger.info(f"LLM response: {response}")
        game.log(
            GameAction(
                type="LLM_response",
                player_id=self.id,
                timestamp=datetime.now(),
                data=dict(response=response),
            )
        )

        # Convert to a GameAction
        return convert_LLM_response(game, response, player_id=self.id)

    def check_LLM_move_valid(self, game, move) -> tuple[bool, str]:
        """Checks if the extracted LLM response is a valid move and catches any errors."""
        return is_valid_move(move, game, self.hand)

    async def make_move(self, game):
        """Ask the LLM to make a move. This requires passing entire game history as an input"""

        # Make a move
        move = self.move_from_LLM_response(game)
        is_valid, additional_prompts = self.check_LLM_move_valid(game, move)

        # If the move is not valid, log the failure and try again with an additional hint
        if not is_valid:
            game.log(
                GameAction(
                    type="invalid_LLM_response",
                    player_id=self.id,
                    timestamp=datetime.now(),
                    data=dict(
                        move_type=move.type,
                        move_data={}
                        if move.type != "play"
                        else dict(
                            declared_rank=move.data["declared_rank"],
                            cards_played=[str(c) for c in move.data["cards_played"]],
                        ),
                    ),
                )
            )
            move = self.move_from_LLM_response(
                game, additional_prompts=additional_prompts
            )
            is_valid, additional_prompts = self.check_LLM_move_valid(game, move)

        # If the move is still not valid, catch the error and make a random move instead
        if not is_valid:
            game.log(
                GameAction(
                    type="invalid_LLM_response",
                    player_id=self.id,
                    timestamp=datetime.now(),
                    data=dict(
                        move_type=move.type,
                        move_data={}
                        if move.type != "play"
                        else dict(
                            declared_rank=move.data["declared_rank"],
                            cards_played=[str(c) for c in move.data["cards_played"]],
                        ),
                    ),
                )
            )
            return await self.random_move(game)

        return move

    async def random_move(self, game) -> GameAction:
        """Make a random move if the API reponse is invalid

        :param game: the current `CheatGame` instance
        :return: (tuple) tuple of declared rank and played cards
        """

        # Call with probability 0.5
        if game.pile and (
            random.random() < 0.5 or len(game.players[game.last_play()[0]].hand) == 0
        ):
            return GameAction(type="call", player_id=self.id)

        else:
            # If this is the first play of the trick, choose a declared rank (not Ace)
            if len(game.pile) == 0:
                # choose declared rank strategically or randomly (cannot declare Ace, and also do not declare a discarded rank)
                declared_rank = random.choice(
                    [r for r in RANKS if (r != "A" and r not in game.discarded_ranks)]
                )
            else:
                declared_rank = game.current_rank  # must match current trick rank

            # Check that there are cards that could be played
            true_cards = [c for c in self.hand if c.rank == declared_rank]

            # Play some true cards with probability 0.5
            if true_cards and random.random() > 0.5:
                chosen = random.sample(true_cards, random.randint(1, len(true_cards)))

            # Lie: play random cards, but not from those that have been discarded (must still declare current rank)
            else:
                chosen = random.sample(
                    self.hand, random.randint(1, min(3, len(self.hand)))
                )

            return GameAction(
                type="play",
                player_id=self.id,
                data=dict(declared_rank=declared_rank, cards_played=chosen),
            )

    async def choose_action(self, game) -> GameAction:
        """Pass-through; required for interface compatibility with bot players"""
        return await self.make_move(game)

    def broadcast_message(self, game, type: str = None, *_, **__):
        """Broadcast an opinion based on the state of play"""
        return generate_comment(game, type, verbosity=self.verbosity, id=self.id)

