suspicions = [
    "Hmm, suspicious ...",
    "No way!",
    "Flip Flip Flip!",
    "That's some BS",
    "Yeah right",
    "Lotta liars these days"
]

suspicions_confirmed = [
    "Thought so",
    "Knew it",
    "So obvious",
]

surprise = [
    "Oh, how surprising!",
    "Not lying -- how unusual",
    "New strategy eh?"
]

pile_picked_up = [
    "So many liars here",
    "Yikes",
    "Oh dear ..."
]

thinking_new_play = [
    "Hm ...",
    "Let's see ...",
]

thinking = [
    "Do I believe this?",
    "Can they be trusted?"
] + thinking_new_play

# Dictionary of message types
message_types = {
    "thinking": thinking,
    "thinking_new_play": thinking_new_play,
    "suspicious": suspicions,
    "suspicions_confirmed": suspicions_confirmed,
    "pile_picked_up": pile_picked_up,
    "surprise": surprise
}