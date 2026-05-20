import math
import pickle
import random

import numpy as np

from cheat.action import GameAction
from cheat.card import RANKS, str_to_Card

from .generic_bot import BotPlayer


class SmartBot(BotPlayer):
    """Smart bot that inherits from the parent Player class. The Smart bot works the following way:
    - Keeps track of other players' behavioural patterns and estimates their lie and call probability
    - Adjusts its probability of lying and calling to what it thinks the players to its left and right are doing
    - Has a decreased probability of lying if it can play the current rank
    - Has a decreased probability of lying if the next player(s) have <4 cards
    - Tracks the cards picked up by other players with <4 cards and avoids leading with those cards
    """

    def __init__(
        self,
        id: int | None = None,
        name: str | None = None,
        display_name: str | None = None,
        avatar: str | None = None,
        verbosity: float = 0.3,
        temperature: float = 0.02,
        display_type: str | None = None,
    ):
        super().__init__(
            id=id,
            name=name,
            avatar=avatar,
            display_name=display_name,
            display_type=display_type,
        )
        self.verbosity = verbosity
        self.temperature = temperature

        # Dictionary containing information about other players — this is built dynamically
        self.other_player_repr = {}
        self.last_action_idx = 0

        # History of estimates, used for writing out
        self.other_player_repr_hist = {}

    def __dict__(self):
        return dict(
            id=self.id,
            name=self.name,
            avatar=self.avatar,
            type=self.type,
            verbosity=self.verbosity,
            temperature=self.temperature,
        )

    def write_info(self, path) -> None:
        """Write out the internal configuration"""

        # TODO: Use json instead
        with open(
            f"{path}/Player_{self.id if self.id is not None else self.name}.pickle",
            "wb",
        ) as file:
            res = self.__dict__()
            res["other_player_repr_hist"] = self.other_player_repr_hist
            pickle.dump(res, file)

    def populate_player_repr(self, game) -> None:
        """Populate the inner representation of other players' estimated dynamics and cards"""

        new_history = game.history[self.last_action_idx :]

        # Clear known_cards only when there is new history to process; this keeps
        # cards visible across repeated calls with no intervening game events.
        if new_history:
            for pid, p_info in self.other_player_repr.items():
                p_info["known_cards"] = []

        # Check only the most recent round
        for idx, action in enumerate(new_history):
            if action.type in ["play", "call"]:
                # Create dictionary entry for player, if not yet present
                if action.player_id not in self.other_player_repr:
                    self.other_player_repr[action.player_id] = {
                        "N_calls": 0,
                        "N_plays": 0,
                        "N_lies": 0,
                        "N_plays_called": 0,
                        "known_cards": [],
                    }
                    self.other_player_repr_hist[action.player_id] = {
                        "p_lie_est": [],
                        "p_call_est": [],
                    }
                if (
                    action.type == "call"
                    and action.data["accused_id"] not in self.other_player_repr
                ):
                    self.other_player_repr[action.data["accused_id"]] = {
                        "N_calls": 0,
                        "N_plays": 0,
                        "N_lies": 0,
                        "N_plays_called": 0,
                        "known_cards": [],
                    }
                    self.other_player_repr_hist[action.data["accused_id"]] = {
                        "p_lie_est": [],
                        "p_call_est": [],
                    }

                # Count the number of calls; log the outcome of the call and the revealed cards;
                # the known cards are cleared after every turn
                if action.type == "call":
                    self.other_player_repr[action.player_id]["N_calls"] += 1
                    self.other_player_repr[action.data["accused_id"]][
                        "N_plays_called"
                    ] += 1
                    if action.data["was_lying"]:
                        self.other_player_repr[action.data["accused_id"]]["N_lies"] += 1
                        self.other_player_repr[action.data["accused_id"]][
                            "known_cards"
                        ].extend(
                            [str_to_Card(c) for c in action.data["revealed_cards"]]
                        )
                    else:
                        if action.player_id != self.id:
                            self.other_player_repr[action.player_id][
                                "known_cards"
                            ].extend(
                                [str_to_Card(c) for c in action.data["revealed_cards"]]
                            )

                # Count the number of plays that could have been calls
                elif action.type == "play":
                    for prev_idx in range(self.last_action_idx + idx - 1, -1, -1):
                        item = game.history[prev_idx]
                        if item.type == "call":
                            break
                        elif item.type == "play":
                            self.other_player_repr[action.player_id]["N_plays"] += 1
                            break

        # Update the estimated lie and call probability for each player
        for pid, p_info in self.other_player_repr.items():
            if pid not in self.other_player_repr_hist:
                self.other_player_repr_hist[pid] = {"p_lie_est": [], "p_call_est": []}
            if p_info.get("N_plays_called", 0) > 0:
                p_info["p_lie_est"] = p_info.get("N_lies", 0) / p_info["N_plays_called"]
                self.other_player_repr_hist[pid]["p_lie_est"].append(
                    p_info["p_lie_est"]
                )

            if p_info.get("N_calls", 0) + p_info.get("N_plays", 0) > 0:
                p_info["p_call_est"] = p_info.get("N_calls", 0) / (
                    p_info.get("N_calls", 0) + p_info.get("N_plays", 0)
                )
                self.other_player_repr_hist[pid]["p_call_est"].append(
                    p_info["p_call_est"]
                )

        # Update the index of items processed
        self.last_action_idx = len(game.history)

    def calculate_prob_of_having_cards(
        self, play, game, cards_of_rank_on_hand
    ) -> float:
        """Calculate the probability that the player held at least n_cards_played cards of the
        declared rank before playing, using the hypergeometric distribution.

        Uses P(≥ k) rather than P(= k) so that players holding more than the minimum are not
        incorrectly penalised.
        """

        deck_size = 4 * (13 - len(game.discarded_ranks))
        n_cards_played = len(play.data["cards_played"])
        hand_size_before = len(game.players[play.player_id].hand) + n_cards_played
        available_rank_cards = 4 - cards_of_rank_on_hand

        # Sum P(having exactly j cards of rank) for j = n_cards_played … min(available, hand)
        total = math.comb(deck_size, hand_size_before)
        return (
            sum(
                math.comb(available_rank_cards, j)
                * math.comb(deck_size - available_rank_cards, hand_size_before - j)
                for j in range(
                    n_cards_played, min(available_rank_cards, hand_size_before) + 1
                )
            )
            / total
        )

    def calculate_lie_prob(self, play: GameAction, game) -> float:
        """Calculates the probability that a play is a lie, based on card distributions. If the player is self,
        can also include knowledge of the own hand count. The underlying assumptions are that if a player holds
        cards of the rank they are purporting to play they will play all of them (i.e. will not play one 3 if they hold
        two; but this is just to simplify the sum).

        :param play: the play to judge
        :param game: state of the game. Only pile sizes and hand counts are used, the decision is not based on the
            actual content of the play.
        :return: estimated probability that the play is a lie
        """

        # Calculate the number of cards of the claimed rank, taking the number of cards on hand into account
        cards_of_rank_on_hand = len(
            [c for c in self.hand if c.rank == play.data["declared_rank"]]
        )

        # Mathematical probability of telling the truth
        p_true_math = self.calculate_prob_of_having_cards(
            play, game, cards_of_rank_on_hand
        )

        # Estimate observed lie probability from behaviour.
        # Prior beta(1, 2) encodes a default ~33% lie rate; updates with observed evidence.
        p_lie_est = np.random.beta(
            1 + self.other_player_repr.get(play.player_id, {}).get("N_lies", 0),
            2
            + self.other_player_repr.get(play.player_id, {}).get("N_plays_called", 0)
            - self.other_player_repr.get(play.player_id, {}).get("N_lies", 0),
        )

        # Probability that they have the cards given the play (Bayes law)
        p_true = p_true_math / (p_true_math * (1 - p_lie_est) + p_lie_est)

        return 1 - p_true

    def calculate_call_prob(self, play: GameAction, game) -> float:
        """Calculates the probability that next player will call a play.

        :param play: the play to judge
        :param game: state of the game. Only pile sizes and hand counts are used, the decision is not based on the
            actual content of the play.
        :return: estimated probability that the play is a lie
        """

        # If we empty our hand, they must call
        if len(play.data["cards_played"]) == len(self.hand):
            return 1

        # Else, if they only have a small number of cards left and the played rank isn't in their known cards,
        # highly likely they will call our play
        elif len(
            game.players[(play.player_id + 1) % game.num_players].hand
        ) <= 2 and play.data["declared_rank"] not in {
            c.rank
            for c in self.other_player_repr.get(
                (play.player_id + 1) % game.num_players, {}
            ).get("known_cards", [])
        }:
            return 1

        # Since we don't know how many cards of the rank they hold, assume they hold one
        cards_of_rank_on_hand = 1

        # Mathematical probability of telling the truth
        p_true_math = self.calculate_prob_of_having_cards(
            play, game, cards_of_rank_on_hand
        )

        # Estimate observed call probability from behaviour.
        # Prior beta(1, 2) encodes a default ~33% call rate; updates with observed evidence.
        p_call_est = np.random.beta(
            1
            + self.other_player_repr.get(
                ((play.player_id + 1) % game.num_players), {}
            ).get("N_calls", 0),
            2
            + self.other_player_repr.get(
                ((play.player_id + 1) % game.num_players), {}
            ).get("N_plays", 0),
        )

        # Probability they think we have the cards given the play
        p_true = p_true_math / (p_true_math * (1 - p_call_est) + p_call_est)

        return 1 - p_true

    def estimate_position(self, hand_sizes: dict) -> int:
        """Estimates the position of self, based on hand count burden. For a move, this calculates the share
        of cards in self's hand. Zero indicates a win, 1 a loss; values in between indicate the relative position
        accordingly. A loss is strongly penalised so that it is avoided at all costs.

        :param hand_sizes: dictionary of the expected hand sizes of the players.
        :return: the expected position in the game, measured as a fraction of hand burden
        """
        res = hand_sizes[self.id] / sum(hand_sizes.values())
        for pid, h in hand_sizes.items():
            if h == 0 and pid == self.id:
                return 0  # strongly incentivise a win
            elif h == 0:
                return 10  # strongly disincentivise any move that leads to a loss
        return res

    async def make_move(self, game) -> GameAction:
        """

        :param game:
        :return:
        """

        # Edge case: previous player is out of cards: must call
        if len(game.players[(self.id - 1) % game.num_players].hand) == 0:
            return GameAction(type="call", player_id=self.id)

        # Edge case: can win with honest play.
        if (
            game.current_rank is None
            and all([c.rank == self.hand[0].rank for c in self.hand])
            and self.hand[0].rank != "A"
        ) or (
            game.current_rank is not None
            and all([c.rank == game.current_rank for c in self.hand])
        ):
            return GameAction(
                type="play",
                player_id=self.id,
                data=dict(
                    declared_rank=self.hand[0].rank, cards_played=list(self.hand)
                ),
            )

        # Build an inner representation of the other player's lie/call rates
        self.populate_player_repr(game)

        # First: choose a rank if none is currently declared
        # If is self's turn to declare a rank, first choose one based on what the next player probably doesn't have
        # and what we have a lot of
        if len(game.pile) == 0:
            # Do not declare a rank self doesn't hold, because the chance of being caught is high with no potential
            # pay-off
            feasible_ranks = set()
            for c in self.hand:
                if c.rank not in feasible_ranks and c.rank != "A":
                    feasible_ranks.add(c.rank)

            # Remove any known ranks in the hands of players with fewer than 4 cards, if that player is sitting at a
            # distance of two or less
            for pid, p_info in self.other_player_repr.items():
                if (pid - self.id + game.num_players) % game.num_players <= 2:
                    if (
                        p_info.get("known_cards", [])
                        and len(game.players[pid].hand) < 4
                    ):
                        for r in {c.rank for c in p_info["known_cards"]}:
                            if r in feasible_ranks:
                                feasible_ranks.remove(r)

            # Select a rank based on the number of cards available of that rank.
            if feasible_ranks:
                current_rank = (
                    np.random.choice(
                        list(feasible_ranks),
                        1,
                        p=np.array(
                            [
                                len([c for c in self.hand if c.rank == r])
                                for r in feasible_ranks
                            ]
                        )
                        / len([c for c in self.hand if c.rank in feasible_ranks]),
                    )
                    .flatten()
                    .item()
                )

            # If no feasible rank exists (e.g. only holding Aces), must lie
            else:
                current_rank = random.choice(
                    [r for r in RANKS if (r != "A" and r not in game.discarded_ranks)]
                )

        else:
            # Must follow suit
            current_rank = game.current_rank

        # Decision analysis: go through all possible plays and select the play with the best chance of winning
        possible_actions = []
        possible_truthful_play = None

        # Simplest case: playing truthfully (if possible).
        if any([c.rank == current_rank for c in self.hand]):
            # Hypothetical truthful play
            action = GameAction(
                type="play",
                player_id=self.id,
                data=dict(
                    declared_rank=current_rank,
                    cards_played=[c for c in self.hand if c.rank == current_rank],
                ),
            )

            # Calculate resulting position in game
            pos = self.estimate_position(
                dict(
                    (p.id, len(p.hand))
                    if p.id != self.id
                    else (
                        p.id,
                        len(p.hand)
                        - len([c for c in self.hand if c.rank == current_rank]),
                    )
                    for p in game.players
                )
            )

            # Append to list of possible actions
            possible_actions.append((action, pos))
            possible_truthful_play = action

        # Next: lie. Can play one, two, or three cards, up to the total number of cards on hand minus one
        # (when playing all cards would definitely be called). If I'm holding only one card (and it's an Ace),
        # I have to play it if I have no other choice. It also makes no sense to lie about fewer cards than
        # the maximum possible truthful play unless I can rid myself of Aces.
        for k in range(1, min(len(self.hand) + 1, 4)):
            # Hypothetical lie with k cards. When lying, prefer to get rid of Aces and cards of which
            # we only have one
            cards_to_lose = [c for c in self.hand if c.rank == "A"]
            cards_to_lose.extend(
                [
                    c
                    for c in self.hand
                    if c not in cards_to_lose
                    and c.rank != current_rank
                    and len([_c for _c in self.hand if _c.rank == c.rank]) == 1
                ]
            )
            if len(cards_to_lose) < k:
                cards_to_lose.extend(
                    np.random.choice(
                        [c for c in self.hand if c not in cards_to_lose],
                        k - len(cards_to_lose),
                        replace=False,
                    )
                )

            # Check that the play isn't actually a true play, in which case it will already have been considered
            if all([c.rank == current_rank for c in cards_to_lose]):
                continue

            # Check that if we are playing leq many cards as the truthful play that we are at least getting
            # rid of an Ace (otherwise no point in lying about fewer cards than the truthful play)
            if possible_truthful_play:
                if not any([c.rank == "A" for c in cards_to_lose[:k]]) and k <= len(
                    possible_truthful_play.data["cards_played"]
                ):
                    continue

            action = GameAction(
                type="play",
                player_id=self.id,
                data=dict(
                    declared_rank=current_rank,
                    cards_played=cards_to_lose[:k],
                ),
            )

            # Calculate probability of being called
            p_call = self.calculate_call_prob(action, game)

            # If called: pick up pile and next player can potentially rid themselves of some cards
            hand_sizes = dict((p.id, len(p.hand)) for p in game.players)
            hand_sizes[self.id] += len(game.pile)
            if len(game.players[(self.id + 1) % game.num_players].hand) < 4:
                hand_sizes[(self.id + 1) % game.num_players] -= 1
            elif len(game.players[(self.id + 1) % game.num_players].hand) < 8:
                hand_sizes[(self.id + 1) % game.num_players] -= 2
            else:
                hand_sizes[(self.id + 1) % game.num_players] -= 3
            pos_called = self.estimate_position(hand_sizes)

            # Possibility of not being called: can rid self of cards
            hand_sizes = dict((p.id, len(p.hand)) for p in game.players)
            hand_sizes[self.id] -= k
            pos_not_called = self.estimate_position(hand_sizes)

            # Append to list of possible outcomes
            possible_actions.append(
                (action, pos_called * p_call + pos_not_called * (1 - p_call))
            )

        # Lastly: call. Calculate the probability that the last play was a lie
        if len(game.pile) > 0:
            # Get last play
            last_player, declared_rank, cards_played = game.last_play()
            last_play = GameAction(
                type="play",
                player_id=last_player,
                data={"cards_played": cards_played, "declared_rank": declared_rank},
            )

            # Calculate the probability they were lying
            p_is_lie = self.calculate_lie_prob(last_play, game)

            # If they were telling the truth: I pick up pile and next player can potentially rid
            # themselves of some cards
            hand_sizes = dict((p.id, len(p.hand)) for p in game.players)
            hand_sizes[self.id] += len(game.pile)
            if len(game.players[(self.id + 1) % game.num_players].hand) < 4:
                hand_sizes[(self.id + 1) % game.num_players] -= 1
            elif len(game.players[(self.id + 1) % game.num_players].hand) < 8:
                hand_sizes[(self.id + 1) % game.num_players] -= 2
            else:
                hand_sizes[(self.id + 1) % game.num_players] -= 3
            pos_true = self.estimate_position(hand_sizes)

            # Possibility they were lying: they pick up the pile and I can potentially rid myself of cards
            hand_sizes = dict((p.id, len(p.hand)) for p in game.players)
            hand_sizes[(self.id - 1) % game.num_players] += len(game.pile)
            hand_sizes[self.id] -= max(
                [
                    len(set([_c for _c in self.hand if _c.rank == c.rank]))
                    for c in self.hand
                    if c.rank != "A"
                ],
                default=0,
            )  # Consider the largest possible number of cards I can shed honestly to make the decision
            pos_lie = self.estimate_position(hand_sizes)

            # Append to list of possible outcomes
            possible_actions.append(
                (
                    GameAction(type="call", player_id=self.id),
                    pos_true * (1 - p_is_lie) + pos_lie * p_is_lie,
                )
            )
        possible_actions = sorted(possible_actions, key=lambda x: x[-1])

        # Softmax weighting of scores
        scores = np.array([pos for _, pos in possible_actions], dtype=float)
        weights = np.exp(-(scores - scores[0]) / self.temperature)
        weights /= weights.sum()
        chosen = np.random.choice(len(possible_actions), p=weights)

        return possible_actions[chosen][0]

    async def choose_action(self, game) -> GameAction:
        """Pass-through; required for interface compatibility with bot players"""
        return await self.make_move(game)
