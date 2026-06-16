import React, {useState, useEffect, useLayoutEffect, useRef, useCallback} from 'react';
import CheatGame from '../CheatGame';

const TUTORIAL_SLIDES = [{
	id: 1,
	title: "Welcome to Cheat!",
	description: "The goal is simple: get rid of all your cards. Cards are played face down, so you can lie about what you’re playing!",
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 11, 9, 10, 12],
		current_player: null,
		current_rank: null,
		pile_size: 0,
		num_players: 5, // No task
	}]
}, {
	id: 2,
	title: "Bots",
	description: "Some of your opponents will be bots; you'll recognise them by their icons.",
	experimentOnly: true,
	playerHighlight: 'bots',
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [
			{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}},
			{your_info: {id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"}},
			{your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}},
			{your_info: {id: 3, name: "Bot 2", cardCount: 10, avatar: "🤖", type: "bot"}},
			{your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}}
		],
		hands: [10, 11, 9, 10, 12],
		current_player: null,
		current_rank: null,
		pile_size: 0,
		num_players: 5,
	}]
}, {
	id: 3,
	title: "Human players",
	description: "Your human opponents will look like this.",
	experimentOnly: true,
	playerHighlight: 'humans',
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [
			{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}},
			{your_info: {id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"}},
			{your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}},
			{your_info: {id: 3, name: "Bot 2", cardCount: 10, avatar: "🤖", type: "bot"}},
			{your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}}
		],
		hands: [10, 11, 9, 10, 12],
		current_player: null,
		current_rank: null,
		pile_size: 0,
		num_players: 5,
	}]
}, {
	id: 4,
	title: "Playing Cards",
	description: "On your turn, select 1–3 cards and declare any rank you like except Ace (i.e. 2-10 or J, Q, K) – you don't need to tell the truth. " + "If you play Aces, you must lie.",
	task: {
		type: 'play_cards',
		description: 'To proceed, select some cards in the game above, declare a rank, and play them.',
		validate: (state) => state.hasPlayedCards // Check if user has played
	},
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 11, 9, 10, 12],
		current_player: 0,
		current_rank: null,
		pile_size: 0,
		num_players: 5,
	}]
}, {
	id: 3,
	title: "Playing Cards",
	description: "The next player can either call your play or play the same rank. If you are caught lying, you pick up the pile. " + "If they call but you were actually telling the truth, they pick up the pile. " + "Click next to see what happens.",
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 11, 9, 10, 12],
		current_player: 1,
		current_rank: null,
		pile_size: 0,
		num_players: 5,
	}, {
		type: "bot_message", sender_id: 1, message: "Hm ... "
	}]
}, {
	id: 4,
	title: "Playing Cards",
	description: "They decided to play! You can see how many cards they declared in the speech bubble.",
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 11, 9, 10, 12],
		current_player: 1,
		current_rank: null,
		pile_size: 0,
		num_players: 5,
	}, {
		type: "cards_played",
		declared_rank: "",
		cards: ["A♦"],
		current_player: 1,
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"] // Need to remove the cards they played!!
		},
		player_id: 1,
		card_count: 1
	}, {
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [
			{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}},
			{your_info: {id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"}},
			{your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
			your_info: {id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"}},
			{your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},
		],
		hands: [10, 10, 9, 10, 12],
		current_player: 1,
		current_rank: null,
		pile_size: 0,
		num_players: 5,
	}]
}, {
	id: 5,
	title: "Lying is Allowed",
	description: "Now the game continues – and as you can see, there is no way everyone is being honest.",
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 10, 9, 10, 12],
		current_player: 2,
		current_rank: null,
		num_players: 5,
	}, {
		type: "cards_played",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		declared_rank: "",
		cards: ["K♦, Q♥"],
		card_count: 2,
		hands: [10, 10, 7, 10, 12],
		current_player: 2,
		num_players: 5,
	}, {
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 10, 7, 10, 12],
		current_player: 3,
		current_rank: null,
		num_players: 5,
	}, {
		type: "cards_played",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		declared_rank: "",
		cards: ["2♦"],
		card_count: 1,
		hands: [10, 10, 7, 9, 12],
		current_player: 3,
		num_players: 5,
	}, {
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 10, 7, 9, 12],
		current_player: 3,
		current_rank: null,
		num_players: 5,
	}]
}, {
	id: 6,
	title: "Lying is Allowed",
	description: "It's your turn again. If you think the previous player was lying, you can call their play. " + "Or, you can select cards to continue playing the same rank. "
	+ "Remember: the rank doesn't change until the pile is cleared, so you will automatically declare the current rank.",
	task: {
		type: 'play_cards',
		description: "To proceed, select some cards and click 'Play'.",
		validate: (state) => state.hasPlayedCards // Check if user has played
	},
	messages: [{
		type: "cards_played",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		declared_rank: "",
		cards: ["A♦", "6♥"],
		card_count: 2,
		hands: [10, 10, 7, 9, 10],
		current_player: 4,
		num_players: 5,
	}, {
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 10, avatar: "🦊"}},],
		hands: [10, 10, 7, 10, 10],
		current_player: 0,
		current_rank: null,
		num_players: 5,
	}]
}, {
	id: 7,
	title: "Calling Bluff",
	description: "Alternatively, if you think the previous player was lying, you can call their play.",
	task: {
		type: 'bluff_called',
		description: "Click the 'Call' button to see what happens.",
		validate: (state) => state.hasCalledBluff, // Check if user has played
		autoAdvance: true, // Advance immediately so the bluff overlay only shows once (on slide 8)
	},
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 10, 7, 9, 12],
		current_player: 4,
		current_rank: null,
		num_players: 5,
	}, {
		type: "cards_played",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		declared_rank: "",
		cards: ["A♦", "6♥"],
		card_count: 2,
		hands: [10, 10, 7, 9, 10],
		current_player: 4,
		num_players: 5,
	}, {
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 10, avatar: "🦊"}},],
		hands: [10, 10, 7, 10, 10],
		current_player: 0,
		current_rank: null,
		num_players: 5,
	}]
}, {
	id: 8,
	title: "Successful Bluff Call",
	description: "When you successfully call a bluff, they pick up the pile and it's your turn again. You can now declare " + "a new rank. " + "If they weren't lying, you pick up the pile and miss a turn.",
	task: {
		type: 'play_cards',
		description: "Continue your turn by picking cards and declaring a new rank.",
		validate: (state) => state.hasPlayedCards // Check if user has played
	},
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 17, avatar: "🦊"}},],
		hands: [10, 10, 7, 10, 12],
		current_player: 0,
		current_rank: -1,
		num_players: 5,
	}]
}, {
	id: 9,
	title: "Discarding four of a kind",
	description: "Four of a kind are automatically discarded – except the Aces! You can only get rid of those by lying.",
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 17, avatar: "🦊"}},],
		hands: [10, 11, 7, 10, 17],
		current_player: 1,
		current_rank: null,
		num_players: 5,
	}, {
		type: "discard", result: "Player 1 discards 6.", your_info: {id: 0}
	}, {
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 7, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 13, avatar: "🦊"}},],
		hands: [10, 7, 3, 10, 17],
		current_player: 1,
		current_rank: null,
		num_players: 5,
	}]
}, {
	id: 10,
	title: "Messaging",
	description: "You can broadcast messages using the Message box, and you can warn the others when someone's cards are running low by clicking on their avatar.",
	task: {
		type: 'human_message',
		description: "Send a message in the game above to continue.",
		validate: (state) => state.hasSentMessage // Check if user has played
	},
	messages: [{
		type: "state",
		your_info: {
			id: 0, name: "You", cardCount: 10, avatar: "🎮", hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"]
		},
		players: [{your_info: {id: 0, name: "You", cardCount: 10, avatar: "🎮"}}, {
			your_info: {
				id: 1, name: "Bot 1", cardCount: 10, avatar: "🤖", type: "bot"
			}
		}, {your_info: {id: 2, name: "Player 1", cardCount: 7, avatar: "🐝️"}}, {
			your_info: {
				id: 3, name: "Bot 2", cardCount: 9, avatar: "🐭", type: "bot"
			}
		}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}},],
		hands: [10, 10, 7, 10, 10],
		current_player: null,
		current_rank: null,
		num_players: 5,
	}, {
		type: "human_message",
		sender_id: 0,
		sender_name: 'You',
		message: "Broadcast a message using the message box below!",
		num_players: 5
	}]
}, {
	id: 11,
	title: "Help",
	description: "The rules, and more information about our lab, are available in the menu, from where you can also exit the game. Have fun!",
	experiment_description: "The rules, and more information about our lab, are available in the menu. Have fun!",
	messages: [{}]
}];

export default function Tutorial({onClose, allowSkip = true, isExperiment= false}) {
	const activeSlides = TUTORIAL_SLIDES.filter(s => !s.experimentOnly || isExperiment);
	const [currentSlide, setCurrentSlide] = useState(0);
	const [mockSocket, setMockSocket] = useState(null);
	const [currentRound, setCurrentRound] = useState(null);
	const [slideDirection, setSlideDirection] = useState('none');
	const [isTransitioning, setIsTransitioning] = useState(false);

	const [isOpening, setIsOpening] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const [showGame, setShowGame] = useState(false);
	const [showText, setShowText] = useState(false);

	const [tutorialState, setTutorialState] = useState({
		current_rank: null,
		current_player: 0,
		hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"],
		lastPlayedCards: [],
		pile_size: 0
	});

	// Track task completion
	const [taskCompleted, setTaskCompleted] = useState(false);

	// Ref so the task-completion effect can call nextSlide without a stale closure
	const nextSlideRef = useRef(null);

	// Timeout IDs for the current slide's in-flight messages.
	// Cancelled immediately on navigation so future-slide messages never reach CheatGame.
	const messageTimeoutsRef = useRef([]);

	// Written by CheatGame on mount; calling it wipes speech bubbles + action queue.
	const clearCheatMessagesRef = useRef(null);

	// slideStatesRef.current[N] = the tutorialState to use when entering slide N.
	// Index 0 is pre-populated with the clean initial state; subsequent entries are
	// written by nextSlide() before advancing, so going back always finds the right snapshot.
	const _initialSlideStates = new Array(activeSlides.length).fill(null);
	_initialSlideStates[0] = {
		current_rank: null, current_player: null,
		hand: ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"],
		pile_size: 0, pile_plays: [], lastPlayedCards: [],
		hasPlayedCards: false, hasCalledBluff: false, hasSentMessage: false,
	};
	const slideStatesRef = useRef(_initialSlideStates);

	// Reset when slide changes – seed tutorialState from this slide's saved snapshot,
	// falling back to the slide's own hardcoded defaults when no snapshot exists yet.
	useEffect(() => {
		setTaskCompleted(false);
		const prevState = slideStatesRef.current[currentSlide];
		const setupMsg = activeSlides[currentSlide].messages.find(msg => msg.type === 'state');
		setTutorialState({
			current_rank: prevState?.current_rank ?? setupMsg?.current_rank ?? null,
			current_player: setupMsg?.current_player ?? 0,
			hand: prevState?.hand ?? setupMsg?.your_info?.hand ?? ['2♠', "2♥", "3♠", "4♥", "8♦", "8♣", "9♦", "J♣", "J♦", "A♣"],
			pile_size: prevState?.pile_size ?? setupMsg?.pile_size ?? 0,
			pile_plays: prevState?.pile_plays ?? [],
			lastPlayedCards: [],
			hasPlayedCards: false,
			hasCalledBluff: false,
			hasSentMessage: false,
		});
	}, [currentSlide]);

	// Check task completion when state changes
	useEffect(() => {
		const slide = activeSlides[currentSlide];

		if (slide.task && slide.task.validate(tutorialState)) {
			if (slide.task.autoAdvance) {
				nextSlideRef.current?.();
			} else {
				setTaskCompleted(true);
			}
		}
	}, [tutorialState, currentSlide]);

	useEffect(() => {
		// Staged opening animation
		// Stage 1: Background fades in immediately
		setIsOpening(true);
		setTimeout(() => {
			setShowGame(true); // Stage 2: Game appears
			setShowText(true); // Stage 3: Text appears
			setTimeout(() => {
				setIsOpen(true);
				setIsOpening(false);
			}, 300);
		}, 300);
	}, []);

	useEffect(() => {

		// Create a mock WebSocket that can receive messages
		const mock = {
			send: (data) => {
				console.log('Tutorial mock send:', data);

				// Parse the sent message to track state
				try {
					const sentMsg = JSON.parse(data);

					// Track declared rank and played cards
					// Track state changes and send responses

					if (sentMsg.type === 'cards_played') {
						const newHand = tutorialState.hand.filter(card => !sentMsg.cards.includes(card));

						setTutorialState(prev => ({
							...prev,
							lastDeclaredRank: sentMsg.declared_rank,
							lastPlayedCards: sentMsg.cards,
							hand: newHand,
							current_rank: sentMsg.declared_rank,
							current_player: 1, // Move to next player
							pile_size: (prev.pile_size ?? 0) + sentMsg.cards.length,
							pile_plays: [...(prev.pile_plays ?? []), {declared_rank: sentMsg.declared_rank, card_count: sentMsg.cards.length, player_id: 0}],
							hasPlayedCards: true,
						}));

						// Send card_played message
						const cardPlayedMsg = {
							type: 'cards_played',
							current_player: 0,
							declared_rank: sentMsg.declared_rank,
							card_count: sentMsg.cards.length,
							your_info: {id: 0, cardCount: newHand.length},
							player_id: 0
						};

						if (mock.onmessage) {
							setTimeout(() => {
								mock.onmessage(new MessageEvent('message', {
									data: JSON.stringify(cardPlayedMsg)
								}));

								// Then send state update
								setTimeout(() => {
									const stateMsg = {
										type: 'state',
										your_info: {
											id: 0, name: "You", cardCount: newHand.length, avatar: "🎮", hand: newHand
										},
										players: [{
											your_info: {
												id: 0, name: "You", cardCount: newHand.length, avatar: "🎮"
											}
										}, {
											your_info: {
												id: 1, name: "Bot 1", cardCount: 11, avatar: "🤖", type: "bot"
											}
										}, {your_info: {id: 2, name: "Player 1", cardCount: 9, avatar: "🐝️"}}, {
											your_info: {
												id: 3, name: "Bot 2", cardCount: 10, avatar: "🐭", type: "bot"
											}
										}, {your_info: {id: 4, name: "Player 2", cardCount: 12, avatar: "🦊"}}],
										current_player: 1, // Next player's turn
										current_rank: sentMsg.declared_rank,
										pile_size: (tutorialState.pile_size ?? 0) + sentMsg.cards.length,
										num_players: 5
									};

									mock.onmessage(new MessageEvent('message', {
										data: JSON.stringify(stateMsg)
									}));
								}, 0); // Small delay between messages
							}, 0);
						}

						return; // Don't echo the original play message
					}
					if (sentMsg.type === 'bluff_called') {

						// Mark task complete
						setTutorialState(prev => ({
							...prev, hasCalledBluff: true
						}));

						// User clicked "Call Bluff" - construct the bluff_called response
						const response = {
							type: 'bluff_called',
							caller: 0,
							caller_name: "You",
							accused: tutorialState.lastPlayer ?? 4,
							accused_name: tutorialState.lastPlayerName ?? "Player 2",
							declared_rank: tutorialState.current_rank ?? "7",
							actual_cards: ["A♦", "6♥"], // Or get from tutorialState
							was_lying: true, // Or determine dynamically
							result: "Player 2 lied!",
							current_player: 0,
							your_info: {id: 0}
						};
						data = JSON.stringify(response);
						console.log('Modified call to bluff_called:', response);
						setTutorialState(prev => ({
							...prev, current_rank: null, pile_plays: [], pile_size: 0
						}));
					}
					if (sentMsg.type === 'human_message') {

						// Mark task complete
						setTutorialState(prev => ({
							...prev, hasSentMessage: true
						}));
					}
				} catch (e) {
					console.error('Error parsing sent message:', e);
				}

				// Short-circuit: immediately trigger onmessage with the sent data
				if (mock.onmessage) {
					const event = new MessageEvent('message', {
						data: data // data is already a JSON string
					});
					console.log('Tutorial mock receive:', data);
					// Use setTimeout to make it async (avoid potential issues)
					setTimeout(() => {
						mock.onmessage(event);
					}, 0);
				}
			}, addEventListener: () => {
			}, removeEventListener: () => {
			}, close: () => {
			}, onmessage: null // Will be set by CheatGame
		};
		setMockSocket(mock);

		// Initialize with first slide's first state message
		const firstStateMsg = activeSlides[0].messages.find(msg => msg.type === 'state');
		if (firstStateMsg) {
			setCurrentRound({
				state: firstStateMsg,
				currentPlayer: firstStateMsg.current_player,
				selfId: firstStateMsg.your_info.id,
				hasActed: false
			});
		}
	}, []);

	useEffect(() => {
		if (!mockSocket) return;

		// Send messages for current slide
		const slide = activeSlides[currentSlide];

		// Use this slide's saved snapshot, if any
		const prevState = slideStatesRef.current[currentSlide];

		const processedMessages = slide.messages.map(msg => {
			const processed = JSON.parse(JSON.stringify(msg));

			if (msg.type === 'cards_played' && msg.declared_rank === '') {
				processed.declared_rank = prevState?.current_rank ?? null;
			}

			if (msg.type === 'cards_played' && msg.your_info?.hand) {
				processed.your_info.hand = prevState?.hand ?? msg.your_info.hand;
			}

			if (msg.type === 'state' && msg.your_info?.hand) {
				processed.your_info.hand = prevState?.hand ?? msg.your_info.hand;
				processed.your_info.cardCount = (prevState?.hand ?? msg.your_info.hand).length;
				processed.pile_size = prevState?.pile_size ?? msg.pile_size ?? 0;
				processed.current_rank = msg.current_rank === -1 ? null : (prevState?.current_rank ?? msg.current_rank);
			}

			return processed;
		});

		// Always prepend a catch_up so CheatGame rebuilds the pile from the saved pile_plays.
		// This undoes any cards added by the previous slide's messages (e.g. bot plays).
		const allMessages = [
			{type: 'catch_up', pile_plays: prevState?.pile_plays ?? []},
			...processedMessages,
		];

		// Send processed messages; track bot card plays into pile_plays as they fire
		messageTimeoutsRef.current = allMessages.map((msg, index) => setTimeout(() => {
			if (msg.type === 'cards_played') {
				setTutorialState(prev => ({
					...prev,
					pile_plays: [...(prev.pile_plays ?? []), {
						declared_rank: msg.declared_rank,
						card_count: msg.card_count,
						player_id: msg.player_id ?? msg.current_player,
					}],
				}));
			}
			const event = new MessageEvent('message', {data: JSON.stringify(msg)});
			mockSocket.onmessage?.(event);
		}, index * 500));

		// Safety-net cleanup (immediate cancellation happens in prevSlide/nextSlide)
		return () => {
			messageTimeoutsRef.current.forEach(clearTimeout);
			messageTimeoutsRef.current = [];
		};
	}, [currentSlide, mockSocket]);

	const handleClose = () => {
		setIsClosing(true);
		setIsOpen(false);
		setShowText(false); // Hide text first
		setShowGame(false); // Then hide game
		setTimeout(() => {
			onClose(); // Finally unmount
		}, 1000);
	};

	const updateRoundState = (newState) => {
		setCurrentRound(prev => ({
			...prev, ...newState
		}));
	};


	const nextSlide = () => {
		// Cancel any in-flight messages from the current slide immediately
		messageTimeoutsRef.current.forEach(clearTimeout);
		messageTimeoutsRef.current = [];

		// Snapshot current state into the next slide's entry so it inherits it on entry (or re-entry)
		slideStatesRef.current[currentSlide + 1] = {...tutorialState};

		if (currentSlide < activeSlides.length - 1) {
			setIsTransitioning(true);
			setSlideDirection('next-exit'); // Old slide exits left

			setTimeout(() => {
				setCurrentSlide(currentSlide + 1);
				setSlideDirection('next-enter'); // New slide starts from right

				setTimeout(() => {
					setSlideDirection('none'); // Slide to center
					setIsTransitioning(false);
				}, 10);
			}, 500);
		} else {
			handleClose();
		}
	};

	// Keep ref in sync so the task-completion effect always calls the latest closure
	nextSlideRef.current = nextSlide;

	const prevSlide = () => {
		// Cancel any in-flight messages from the current slide immediately
		messageTimeoutsRef.current.forEach(clearTimeout);
		messageTimeoutsRef.current = [];
		clearCheatMessagesRef.current?.();

		if (currentSlide > 0) {
			setIsTransitioning(true);
			setSlideDirection('prev-exit'); // Old slide exits right

			setTimeout(() => {
				setCurrentSlide(currentSlide - 1);
				setSlideDirection('prev-enter'); // New slide starts from left

				setTimeout(() => {
					setSlideDirection('none'); // Slide to center
					setIsTransitioning(false);
				}, 10);
			}, 500);
		}
	};

	const [containerSize, setContainerSize] = useState({width: 0, height: 0});
	const resizeObserverRef = useRef(null);

	const gameWrapperRef = useCallback((node) => {
		if (resizeObserverRef.current) {
			resizeObserverRef.current.disconnect();
		}
		if (!node) return;

		const updateSize = () => {
			setContainerSize({
				width: node.offsetWidth, height: node.offsetHeight,
			});
		};

		updateSize();
		const ro = new ResizeObserver(updateSize);
		ro.observe(node);
		resizeObserverRef.current = ro;
	}, []);

	// Smooth height animation for the description panel.
	// useLayoutEffect fires before paint so we can snap to the old height,
	// then rAF applies the new one, giving the CSS transition a concrete start point.
	const descRef = useRef(null);
	const descHeightRef = useRef(null);
	useLayoutEffect(() => {
		const el = descRef.current;
		if (!el) return;
		el.style.transition = 'none';
		el.style.height = 'auto';
		const newHeight = el.scrollHeight;
		if (descHeightRef.current !== null) {
			el.style.height = descHeightRef.current + 'px';
			requestAnimationFrame(() => {
				el.style.transition = 'height 0.5s ease';
				el.style.height = newHeight + 'px';
				descHeightRef.current = newHeight;
			});
		} else {
			el.style.height = newHeight + 'px';
			el.style.transition = 'height 0.5s ease';
			descHeightRef.current = newHeight;
		}
	}, [currentSlide]);

	const slide = activeSlides[currentSlide];

	return (<div
		className={`fixed inset-0 z-50 flex items-center justify-center p-[2%] transition-all transform-gpu duration-1000 ${(isOpening || isOpen) ? 'bg-opacity-40 backdrop-blur-lg bg-black' : ''}`}
	>

		{/* Close button: always shown if allowSkip, otherwise only on last slide */}
		{(!allowSkip && currentSlide !== activeSlides.length - 1) ? <></> : <button
			onClick={handleClose}
			className={`absolute top-5 right-5 text-gray-500 hover:text-gray-700 transition-all duration-300 z-10 ${showText ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
		>
			<svg
				className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors p-1"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>}

		{/* Outer div, containing Game preview box (75%) and explanations (25%) */}
		<div
			className={`relative duration-500 h-full max-w-6xl w-full rounded-2xl ${isOpen ? 'shadow-2xl' : ''} ${isClosing ? 'opacity-0' : ''} bg-gradient-to-br from-green-900 to-blue-900 mx-4 overflow-hidden flex flex-col`}
		>

			{/* Game Preview: 75%; top-aligned */}
			<div className="relative flex-1 min-h-0">

				{/* Actual game box in a slightly smaller contained with a white border*/}
				<div style={{width: '90%', height: '90%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)'}}
						 className="relative border-2 rounded-3xl shadow-2xl" ref={gameWrapperRef}>
					{mockSocket && currentRound && containerSize.width > 0 && (<div
						className={`relative inset-0 transition-all duration-1000 ${showGame ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
						style={{
							top: '50%',
							left: '50%',
							transform: `translate(-50%, -50%) scale(${showGame ? 0.7 : 0.65})`,
							width: `${100 / 0.7}%`,
							height: `${100 / 0.7}%`,
							transformOrigin: 'center center',
						}}
					>
						<CheatGame
							socket={mockSocket}
							gameConfig={{numPlayers: 5, predefinedMessages: null, selfId: 0, experimentalMode: isExperiment}}
							currentRound={currentRound}
							onUpdateRound={updateRoundState}
							onExitGame={() => {
							}}
							highlightMenu={currentSlide === activeSlides.length - 1}
							containerWidth={containerSize.width}  // Pass container size
							containerHeight={containerSize.height}
							tutorialScale={0.7}
							disableReconnect={true}
							showDealAnimation={false}
							clearMessagesRef={clearCheatMessagesRef}
							playerHighlight={activeSlides[currentSlide]?.playerHighlight ?? null}
						/>
					</div>)}</div>
			</div>

			{/* Description and Controls: 25% */}
			<div
				ref={descRef}
				className={`relative p-6 pl-20 pr-20 flex flex-col items-center justify-center text-center overflow-hidden transition-all duration-1000 ${showText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
				style={{flexShrink: 0, minHeight: '120px'}}
			>

				<div
					key={currentSlide}
					className={`transition-all duration-500 ${slideDirection === 'next-exit' ? 'transform -translate-x-1/2 opacity-0' :  // Exit left
						slideDirection === 'next-enter' ? 'transform translate-x-1/2 opacity-0' :  // Enter from right (initial)
							slideDirection === 'prev-exit' ? 'transform translate-x-1/2 opacity-0' :   // Exit right
								slideDirection === 'prev-enter' ? 'transform -translate-x-1/2 opacity-0' : // Enter from left (initial)
									'transform translate-x-0 opacity-100'}`}
				>
					<h2 className="text-gray-50 text-xl sm:text-3xl font-bold mb-2 whitespace-nowrap">{slide.title}</h2>
					<p className="text-gray-300 text-sm sm:text-lg mb-6">
						{slide.experiment_description ? slide.experiment_description : slide.description}
						{slide.task && (<span className="text-yellow-400"> {slide.task.description}</span>)}
					</p>
				</div>
				{/* Previous button */}
				{currentSlide === 0 ? <></> : <button
					onClick={prevSlide}
					className="absolute top-1/2 left-5 text-gray-500 hover:text-gray-700 transition-colors z-10"
				>
					<svg
						className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-2xl transition-colors p-1"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M15 19l-7-7 7-7"
						/>
					</svg>
				</button>}

				{/* Next button */}
				<button
					onClick={nextSlide}
					disabled={slide.task && !taskCompleted}
					className={`absolute top-1/2 right-5 transition-colors z-10 ${slide.task && !taskCompleted ? 'opacity-0' : ''}`}
				>
					<svg
						className={`w-7 h-7 ${(slide.task && !taskCompleted) || (!slide.task) ? 'bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-800' : 'bg-green-600 hover:bg-green-700 text-white hover:text-gray-200'} rounded-2xl transition-colors p-1`}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</button>

				<div className="absolute bottom-0 flex mb-3 gap-2 justify-center">
					{activeSlides.map((_, index) => (<div
						key={index}
						className={`w-2 h-2 rounded-full transition-colors ${index === currentSlide ? 'bg-white' : 'bg-gray-500'}`}
					/>))}
				</div>

			</div>
		</div>
	</div>);
}
