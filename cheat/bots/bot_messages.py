suspicions = [
    "Hmm, suspicious ...",
    "No way!",
    "Flip Flip Flip!",
    "That's some BS",
    "Yeah right",
    "Lotta liars these days",
]

suspicions_confirmed = [
    "Thought so",
    "Knew it",
    "So obvious",
]

surprise = ["Oh, how surprising!", "Not lying for once", "New strategy eh?"]

pile_picked_up = [
    "So many liars here",
    "Yikes",
    "Oh dear ...",
    "So many aces ...",
    "Everyone out here lying",
]

small_pile_picked_up = ["Worth a shot", "Thought I'd give it a go"]

taunt_blatant_lie = [
    "The nerve!",
    "Jeez!",
    "So cheeky",
    "Damn son",
    "Classic",
    "I'm not surprised",
]

thinking_new_play = [
    "Hm ...",
    "Let's see ...",
]

thinking_calling = ["Do I believe this?", "Can this be trusted?", "Sure about that?"]


# Dictionary of message types
message_types = {
    "thinking_calling": thinking_calling,
    "thinking_new_play": thinking_new_play,
    "suspicious": suspicions,
    "suspicions_confirmed": suspicions_confirmed,
    "pile_picked_up": pile_picked_up,
    "surprise": surprise,
    "taunt_blatant_lie": taunt_blatant_lie,
    "small_pile_picked_up": small_pile_picked_up,
}

import random

def generate_comment(game, type: str = None, *_, verbosity: float, id: int, **__):
    """Broadcast an opinion based on the state of play"""

    # Return a specific type of message if requested
    if type is not None and random.random() < verbosity:
        if type == "thinking" and game.current_rank is None:
            return random.choice(message_types["thinking_new_play"])
        return random.choice(message_types[type])

    # Stay silent based on verbosity
    if random.random() > verbosity or len(game.history) == 0:
        return None

    # Get the last action that is a play or a call
    last_play_idx = len(game.history) - 1
    while (
            game.history[last_play_idx].type not in ["play", "call"]
            and last_play_idx > 0
    ):
        last_play_idx -= 1
    last_play = game.history[last_play_idx]

    # If the last play was a call, the two players involved can say something and the others can send a taunt
    if last_play.type == "call":
        # Am the accused
        if last_play.data["accused_id"] == id:
            # Got caught lying: only say something if you're not picking up just your own cards
            if last_play.data["was_lying"]:
                # If you are just picking up your own cards
                if len(game.history[last_play_idx + 1].data["pile"]) <= 3:
                    return random.choice(message_types["small_pile_picked_up"])
                # If you are picking up the pile
                return random.choice(message_types["pile_picked_up"])

        # Am the accuser:
        elif last_play.player_id == id:
            # Caught someone else lying
            if last_play.data["was_lying"]:
                return random.choice(message_types["suspicions_confirmed"])
            # Failed to catch them and picked up the pile
            else:
                return random.choice(
                    message_types["surprise"] + message_types["pile_picked_up"]
                )

        # Not involved in the play: can taunt a lie
        else:
            if last_play.data["was_lying"]:
                return random.choice(message_types["taunt_blatant_lie"])

    # Last play was a play by someone else (i.e. not self)
    elif last_play.type == "play":
        # If it is my turn next, don't say anything here because I will have a chance in a second
        if (last_play.player_id + 1) % len(game.players) == id:
            return None
        return random.choice(message_types["suspicious"])

    return None

