import random
import pickle
from cheat.card import RANKS, Card, str_to_Card
from cheat.player import Player
from cheat.bots.bot_messages import message_types
from cheat.action import GameAction

class SmartBot(Player):
    """ Smart bot that inherits from the parent Player class. The Smart bot works the following way:
        - Keeps track of other players' behavioural patterns and estimates their lie and call probability
        - Adjusts its probability of lying and calling to what it thinks the players to its left and right are doing
        - Has a decreased probability of lying if it can play the current rank
        - Has a decreased probability of lying if the next player(s) have <4 cards
        - Tracks the cards picked up by other players with <4 cards and avoids leading with those cards
    """

    def __init__(self, id: int | None = None,
                 name: str | None = None,
                 avatar: str | None = None,
                 verbosity: float = 0.3):
        super().__init__(id=id, name=name, avatar=avatar, type="bot")
        self.verbosity = verbosity

        # Dictionary containing information about other players — this is built dynamically
        self.other_player_repr = {}
        self.last_action_idx = 0

        # History of estimates, used for writing out
        self.other_player_repr_hist = {}

    def __dict__(self):
        return dict(id=self.id, name=self.name, avatar=self.avatar, type=self.type, verbosity=self.verbosity)

    def write_info(self, path) -> None:
        """ Write out the internal configuration"""

        # TODO: Use json instead
        with open(f"{path}/Player_{self.id if self.id is not None else self.name}.pickle", "wb") as file:
            res = self.__dict__()
            res['other_player_repr_hist'] = self.other_player_repr_hist
            pickle.dump(res, file)

    def populate_player_repr(self, game) -> None:
        """ Populate the inner representation of other players' estimated dynamics and cards"""

        # Clear the known cards list
        for pid, p_info in self.other_player_repr.items():
            p_info["known_cards"] = []

        # Check only the most recent round
        for idx, action in enumerate(game.history[self.last_action_idx:]):
            if action.type in ["play", "call"]:

                # Create dictionary entry for player, if not yet present
                if action.player_id not in self.other_player_repr:
                    self.other_player_repr[action.player_id] = {
                        "N_calls": 0, "N_plays": 0, "N_lies": 0, "N_plays_called": 0, "known_cards": []
                    }
                    self.other_player_repr_hist[action.player_id] = {"p_lie_est": [], "p_call_est": []}
                if action.type == "call" and action.data["accused_id"] not in self.other_player_repr:
                    self.other_player_repr[action.data["accused_id"]] = {
                        "N_calls": 0, "N_plays": 0, "N_lies": 0, "N_plays_called": 0, "known_cards": []
                    }
                    self.other_player_repr_hist[action.data["accused_id"]] = {"p_lie_est": [], "p_call_est": []}

                # Count the number of calls; log the outcome of the call and the revealed cards;
                # the known cards are cleared after every turn
                if action.type == "call":
                    self.other_player_repr[action.player_id]["N_calls"] += 1
                    self.other_player_repr[action.data["accused_id"]]["N_plays_called"] += 1
                    if action.data["was_lying"]:
                        self.other_player_repr[action.data["accused_id"]]["N_lies"] += 1
                        self.other_player_repr[action.data["accused_id"]]["known_cards"].extend([str_to_Card(c) for c in action.data["revealed_cards"]])
                    else:
                        if action.player_id != self.id:
                            self.other_player_repr[action.player_id]["known_cards"].extend([str_to_Card(c) for c in action.data["revealed_cards"]])

                # Count the number of plays that could have been calls
                elif action.type == "play":
                    for item in game.history[self.last_action_idx+idx-1::-1]:
                        if item.type == "call":
                            break
                        elif item.type == "play":
                            self.other_player_repr[action.player_id]["N_plays"] += 1
                            break

        # Update the estimated lie and call probability for each player
        for pid, p_info in self.other_player_repr.items():

            if p_info.get("N_plays_called", 0) > 0:
                p_info["p_lie_est"] = p_info.get("N_lies", 0) / p_info["N_plays_called"]
                self.other_player_repr_hist[pid]["p_lie_est"].append(p_info["p_lie_est"])

            if p_info.get("N_calls", 0) + p_info.get("N_plays", 0) > 0:
                p_info["p_call_est"] = p_info.get("N_calls", 0) / (p_info.get("N_calls", 0) + p_info.get("N_plays", 0))
                self.other_player_repr_hist[pid]["p_call_est"].append(p_info["p_call_est"])

        # Update the index of items processed
        self.last_action_idx = len(game.history)

    async def make_move(self, game) -> GameAction:
        """ Play some cards, either true ones or false

        :param game: the current `CheatGame` instance
        :return: (tuple) tuple of declared rank and played cards
        """

        # Build an inner representation of the other players
        self.populate_player_repr(game)

        # Initial probabilities
        p_lie, p_call = 0.5, 0.5

        if len(game.pile) == 0:

            # Do not declare a rank self doesn't hold, because the chance of being caught is high with no potential
            # pay-off
            feasible_ranks = []
            for c in self.hand:
                if c.rank not in feasible_ranks and c.rank != "A":
                    feasible_ranks.append(c.rank)

            # Remove any known ranks in the hands of players with fewer than 4 cards, if that player is sitting at a
            # distance of two or less
            for pid, p_info in self.other_player_repr.items():
                if (pid - self.id + game.num_players) % game.num_players <= 2:
                    if p_info.get("known_cards", []) and len(game.players[pid].hand) < 4:
                        for r in set([c.rank for c in p_info["known_cards"]]):
                            if r in feasible_ranks:
                                feasible_ranks.remove(r)
        else:
            # Must follow suit
            feasible_ranks = [game.current_rank]

        # If a player is running low on cards, decrease lie probability proportionally to distance from that player
        low_running_players = [p.id for p in game.players if len(p.hand) < 4]
        if low_running_players:
            d_min = min([(pid - self.id + game.num_players) % game.num_players for pid in low_running_players])
            # Decrease chance of lying by distance
            p_lie *= (d_min - 1) / max(1, game.num_players - 2)

        # If the previous player is running low on cards, increase chance of calling by number of cards left on hand.
        # If the previous player has no cards left, p_call is 1 and the play is necessarily called
        if len(game.players[(self.id - 1) % game.num_players].hand) < 4:
            p_call = min(1, p_call + (1.0/float(len(game.players[(self.id - 1) % game.num_players].hand))))
            if p_call == 1 and len(game.pile) > 0:
                return GameAction(type='call', player_id=self.id)

        # Get the estimated lie probability of the previous player
        prev_player_info = self.other_player_repr.get((self.id - 1) % game.num_players, {})
        if prev_player_info.get("p_lie_est"):
            p_call = 0.5 * (p_call + prev_player_info["p_lie_est"])
        next_player_info = self.other_player_repr.get((self.id + 1) % game.num_players, {})
        if next_player_info.get("p_call_est"):
            p_lie = max(0, p_lie - next_player_info["p_call_est"])

        # Call
        if len(game.pile) > 0 and random.random() < p_call:
            return GameAction(type='call', player_id=self.id)

        # Play
        else:

            # Select a rank. If no feasible rank exists (e.g. only holding Aces), must lie
            if game.current_rank:
                declared_rank = game.current_rank
            elif feasible_ranks:
                declared_rank = random.choice(feasible_ranks)
            else:
                declared_rank = random.choice([r for r in RANKS if (r != "A" and r not in game.discarded_ranks)])

            # If holding cards of the chosen rank, prefer to play the truth
            true_cards = [c for c in self.hand if c.rank == declared_rank]
            if true_cards:
                p_lie *= 0.5

            # Lie with given probability or if not true cards available
            if random.random() < p_lie or not true_cards:

                # Choose how many cards to play depending on the assumed probability of being called
                if next_player_info.get("p_call_est", None) is None:
                    n_cards_to_play = random.randint(1, min(3, len(self.hand)))
                else:
                    if next_player_info["p_call_est"] < 0.2:
                        n_cards_to_play = min(3, len(self.hand))
                    elif next_player_info["p_call_est"] < 0.5:
                        n_cards_to_play = min(2, len(self.hand))
                    else:
                        n_cards_to_play = min(1, len(self.hand))

                # Select some random cards to play that are NOT of the declared rank and are preferably aces
                chosen = []
                potential_other_cards = []
                for c in self.hand:
                    if c.rank == 'A' and len(chosen) < n_cards_to_play:
                        chosen.append(c)
                    elif c.rank != declared_rank:
                        potential_other_cards.append(c)
                if len(chosen) < n_cards_to_play:
                    chosen.extend(random.sample(potential_other_cards, min(len(potential_other_cards), n_cards_to_play - len(chosen))))
            else:
                chosen = random.sample(true_cards, random.randint(1, len(true_cards)))

            return GameAction(type="play", player_id=self.id, data=dict(declared_rank=declared_rank, cards_played=chosen))

    async def choose_action(self, game) -> GameAction:
        """ Pass-through; required for interface compatibility with bot players"""
        return await self.make_move(game)

    def broadcast_message(self, game, type: str = None, *_, **__):
        """ Broadcast an opinion based on the state of play"""

        # Stay silent based on verbosity
        if random.random() > self.verbosity or len(game.history) == 0:
            return None

        # Return a specific type of message if requested
        if type is not None:
            if type == "thinking" and game.current_rank is None:
                return random.choice(message_types["thinking_new_play"])
            return random.choice(message_types[type])

        # Get the last action that is a play or a call
        last_play_idx = -1
        while game.history[last_play_idx].type not in ["play", "call"]:
            last_play_idx -= 1
        last_play = game.history[last_play_idx]

        # If the last play was a call, the two players involved can say something and the others can send a taunt
        if last_play.type == "call":

            # Am the accused
            if last_play.data["accused_id"] == self.id:
                # Got caught lying: only say something if you're not picking up just your own cards
                if last_play.data["was_lying"]:
                    # If you are just picking up your own cards
                    if len(game.history[last_play_idx+1].data["pile"]) <=3:
                        return random.choice(message_types["small_pile_picked_up"])
                    # If you are picking up the pile
                    return random.choice(message_types["pile_picked_up"])

            # Am the accuser:
            elif last_play.player_id == self.id:
                # Caught someone else lying
                if last_play.data["was_lying"]:
                    return random.choice(message_types["suspicions_confirmed"])
                # Failed to catch them and picked up the pile
                else:
                    return random.choice(message_types["surprise"] + message_types['pile_picked_up'])

            # Not involved in the play: can taunt a lie
            else:
                if last_play.data["was_lying"]:
                    return random.choice(message_types["taunt_blatant_lie"])

        # Last play was a play by someone else (i.e. not self)
        elif last_play.type == "play":
            # If it is my turn next, don't say anything here because I will have a chance in a second
            if (last_play.player_id + 1) % len(game.players) == self.id:
                return None
            return random.choice(message_types["suspicious"])

        return None
