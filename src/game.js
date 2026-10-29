export const SUITS = [
  { id: "C", symbol: "♣", name: "Clubs", color: "black" },
  { id: "D", symbol: "♦", name: "Diamonds", color: "red" },
  { id: "S", symbol: "♠", name: "Spades", color: "black" },
  { id: "H", symbol: "♥", name: "Hearts", color: "red" }
];

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SEVENS_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const CONTRACTS = [
  {
    id: "hearts",
    name: "Kupat",
    english: "The Hearts",
    symbol: "♥",
    summary: "Every captured heart is −2",
    tip: "Empty a short non-heart suit early, then use that void to discard your highest hearts."
  },
  {
    id: "queens",
    name: "Çupat",
    english: "The Queens",
    symbol: "Q",
    summary: "Every captured queen is −4",
    tip: "Track the ace and king of each suit. A queen becomes dangerous after both higher cards are gone."
  },
  {
    id: "pig",
    name: "Derri",
    english: "The Pig",
    symbol: "K♠",
    summary: "Avoid capturing the King of Spades",
    tip: "Spades cannot open the first three tricks unless unavoidable. Keep low spades as cover and create a side-suit void for K♠."
  },
  {
    id: "tricks",
    name: "Duart",
    english: "The Tricks",
    symbol: "+2",
    summary: "Every captured trick is +2",
    tip: "Cash certain winners, establish long suits and preserve a high card as an entry back to the lead."
  },
  {
    id: "sevens",
    name: "Shtatat",
    english: "The Sevens",
    symbol: "7♦",
    summary: "Finish your cards before everyone else",
    tip: "Aces can finish a suit beside its 2 or K. If blocked, you pass and receive one card from the preceding active player."
  }
];

export const DEFAULT_PLAYERS = ["You", "Arben", "Elira", "Besnik"];

export function cardId(rank, suit) {
  return `${rank}${suit}`;
}

export function createDeck() {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: cardId(rank, suit.id),
      rank,
      suit: suit.id,
      symbol: suit.symbol,
      color: suit.color,
      value: RANKS.indexOf(rank) + 2
    }))
  );
}

export function shuffledDeck(random = Math.random) {
  const deck = createDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function sortHand(hand) {
  const suitOrder = new Map(SUITS.map((suit, index) => [suit.id, index]));
  hand.sort((a, b) => suitOrder.get(a.suit) - suitOrder.get(b.suit) || a.value - b.value);
  return hand;
}

export function trickWinner(trick) {
  if (!trick.length) return null;
  const leadSuit = trick[0].card.suit;
  return trick
    .filter((play) => play.card.suit === leadSuit)
    .reduce((best, play) => (play.card.value > best.card.value ? play : best));
}

export function legalTrickCards(hand, trick, forbiddenLeadSuit = null) {
  if (!trick.length) {
    if (forbiddenLeadSuit) {
      const alternatives = hand.filter((card) => card.suit !== forbiddenLeadSuit);
      if (alternatives.length) return alternatives;
    }
    return [...hand];
  }
  const leadSuit = trick[0].card.suit;
  const matching = hand.filter((card) => card.suit === leadSuit);
  return matching.length ? matching : [...hand];
}

export function contractPoints(contractId, cards, isCompletedTrick = true) {
  if (contractId === "pig") return cards.some((card) => card.id === "KS") ? -16 : 0;
  if (contractId === "queens") return cards.filter((card) => card.rank === "Q").length * -4;
  if (contractId === "hearts") return cards.filter((card) => card.suit === "H").length * -2;
  if (contractId === "tricks") return isCompletedTrick ? 2 : 0;
  return 0;
}

export function isTrickContractComplete(contractId, playedCards, trickNumber) {
  if (contractId === "pig") return playedCards.some((card) => card.id === "KS");
  if (contractId === "queens") return playedCards.filter((card) => card.rank === "Q").length === 4;
  if (contractId === "hearts") return playedCards.filter((card) => card.suit === "H").length === 13;
  if (contractId === "tricks") return trickNumber === 13;
  return false;
}

export function legalSevensCards(hand, board, forceSevenDiamonds = false) {
  if (forceSevenDiamonds) {
    const opener = hand.find((card) => card.id === "7D");
    return opener ? [opener] : [];
  }

  return hand.filter((card) => {
    const suitState = board[card.suit];
    const rankIndex = SEVENS_RANKS.indexOf(card.rank);
    if (!suitState) return card.rank === "7";
    if (card.rank === "A") {
      return !suitState.aceSide && (suitState.low === 1 || suitState.high === SEVENS_RANKS.length - 1);
    }
    return rankIndex === suitState.low - 1 || rankIndex === suitState.high + 1;
  });
}

export function placeSevenCard(board, card) {
  const rankIndex = SEVENS_RANKS.indexOf(card.rank);
  if (!board[card.suit]) {
    if (card.rank !== "7") throw new Error("A suit must be opened with its seven.");
    board[card.suit] = { low: rankIndex, high: rankIndex, aceSide: null };
  } else if (card.rank === "A" && !board[card.suit].aceSide && board[card.suit].low === 1) {
    board[card.suit].aceSide = "low";
  } else if (card.rank === "A" && !board[card.suit].aceSide && board[card.suit].high === SEVENS_RANKS.length - 1) {
    board[card.suit].aceSide = "high";
  } else if (rankIndex === board[card.suit].low - 1) {
    board[card.suit].low = rankIndex;
  } else if (rankIndex === board[card.suit].high + 1) {
    board[card.suit].high = rankIndex;
  } else {
    throw new Error("That card is not adjacent to the open sequence.");
  }
}

export class PeskacGame {
  constructor({ players = DEFAULT_PLAYERS, random = Math.random } = {}) {
    this.players = players;
    this.random = random;
    this.reset();
  }

  reset() {
    this.contractIndex = -1;
    this.contract = null;
    this.totals = [0, 0, 0, 0];
    this.history = [];
    this.phase = "idle";
    this.hands = [[], [], [], []];
    this.roundScores = [0, 0, 0, 0];
    this.captured = [[], [], [], []];
    this.trick = [];
    this.board = {};
    this.voidSuits = [new Set(), new Set(), new Set(), new Set()];
    this.playedCards = [];
    this.finishOrder = [];
    this.currentPlayer = 0;
    this.trickNumber = 0;
    this.openingPlay = true;
  }

  startSuite() {
    this.reset();
    this.startContract(0);
  }

  startContract(index) {
    if (index < 0 || index >= CONTRACTS.length) throw new Error("Invalid contract index.");
    const deck = shuffledDeck(this.random);
    this.contractIndex = index;
    this.contract = CONTRACTS[index];
    this.phase = "playing";
    this.hands = [[], [], [], []];
    deck.forEach((card, cardIndex) => this.hands[cardIndex % 4].push(card));
    this.hands.forEach(sortHand);
    this.roundScores = [0, 0, 0, 0];
    this.captured = [[], [], [], []];
    this.trick = [];
    this.board = {};
    this.voidSuits = [new Set(), new Set(), new Set(), new Set()];
    this.playedCards = [];
    this.finishOrder = [];
    this.trickNumber = 0;
    this.openingPlay = this.contract.id === "sevens";
    this.currentPlayer = this.contract.id === "sevens"
      ? this.hands.findIndex((hand) => hand.some((card) => card.id === "7D"))
      : index % this.players.length;
  }

  getLegalCards(player = this.currentPlayer) {
    if (this.phase !== "playing" || player !== this.currentPlayer) return [];
    if (this.contract.id === "sevens") {
      return legalSevensCards(this.hands[player], this.board, this.openingPlay);
    }
    const forbiddenLeadSuit = this.contract.id === "pig" && this.trickNumber < 3 ? "S" : null;
    return legalTrickCards(this.hands[player], this.trick, forbiddenLeadSuit);
  }

  playCard(player, selectedCardId) {
    if (this.phase !== "playing") throw new Error("The contract is not active.");
    if (player !== this.currentPlayer) throw new Error("It is not that player's turn.");
    const legal = this.getLegalCards(player);
    const card = legal.find((candidate) => candidate.id === selectedCardId);
    if (!card) throw new Error("That card is not legal now.");

    const handIndex = this.hands[player].findIndex((candidate) => candidate.id === card.id);
    this.hands[player].splice(handIndex, 1);
    this.playedCards.push(card);
    this.openingPlay = false;

    if (this.contract.id === "sevens") return this.playSeven(player, card);
    return this.playTrickCard(player, card);
  }

  playTrickCard(player, card) {
    if (this.trick.length && card.suit !== this.trick[0].card.suit) {
      this.voidSuits[player].add(this.trick[0].card.suit);
    }
    this.trick.push({ player, card });
    const result = { type: "card", player, card, trickComplete: false };

    if (this.trick.length < 4) {
      this.currentPlayer = (player + 1) % 4;
      return result;
    }

    const winner = trickWinner(this.trick).player;
    const completedTrick = this.trick.map((play) => ({ ...play }));
    const trickCards = completedTrick.map((play) => play.card);
    this.captured[winner].push(...trickCards);
    const points = contractPoints(this.contract.id, trickCards, true);
    this.roundScores[winner] += points;
    this.trickNumber += 1;
    this.trick = [];
    this.currentPlayer = winner;

    Object.assign(result, { trickComplete: true, winner, points, completedTrick });
    if (isTrickContractComplete(this.contract.id, this.playedCards, this.trickNumber)) this.completeContract();
    return result;
  }

  playSeven(player, card) {
    placeSevenCard(this.board, card);
    const result = { type: "seven", player, card, finished: false };
    if (this.hands[player].length === 0) {
      this.recordFinish(player);
      result.finished = true;
    }
    if (this.phase === "playing") this.currentPlayer = this.nextActivePlayer(player);
    return result;
  }

  previousActivePlayer(player) {
    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = (player - offset + 4) % 4;
      if (this.hands[candidate].length > 0) return candidate;
    }
    return -1;
  }

  nextActivePlayer(player) {
    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = (player + offset) % 4;
      if (this.hands[candidate].length > 0) return candidate;
    }
    return player;
  }

  transferCard(donor, recipient, selectedCardId) {
    if (this.contract.id !== "sevens" || this.phase !== "playing") {
      throw new Error("Cards are transferred only during Shtatat.");
    }
    if (recipient !== this.currentPlayer || this.getLegalCards(recipient).length) {
      throw new Error("The current player must be blocked before receiving a card.");
    }
    if (donor !== this.previousActivePlayer(recipient)) throw new Error("Wrong donating player.");
    const cardIndex = this.hands[donor].findIndex((card) => card.id === selectedCardId);
    if (cardIndex < 0) throw new Error("The donor does not hold that card.");
    const [card] = this.hands[donor].splice(cardIndex, 1);
    this.hands[recipient].push(card);
    sortHand(this.hands[recipient]);
    const result = { type: "transfer", donor, recipient, card, donorFinished: false };

    if (this.hands[donor].length === 0) {
      this.recordFinish(donor);
      result.donorFinished = true;
    }
    if (this.phase === "playing") this.currentPlayer = this.nextActivePlayer(recipient);
    return result;
  }

  recordFinish(player) {
    if (!this.finishOrder.includes(player)) this.finishOrder.push(player);
    const remaining = [0, 1, 2, 3].filter(
      (candidate) => !this.finishOrder.includes(candidate) && this.hands[candidate].length > 0
    );
    if (this.finishOrder.length === 3 && remaining.length === 1) {
      this.finishOrder.push(remaining[0]);
      this.completeContract();
    } else if (this.finishOrder.length === 4) {
      this.completeContract();
    }
  }

  completeContract() {
    if (this.phase === "contract_complete") return;
    if (this.contract.id === "sevens") {
      const awards = [32, 16, 8, 4];
      this.finishOrder.forEach((player, place) => {
        this.roundScores[player] = awards[place];
      });
    }
    this.roundScores.forEach((score, player) => {
      this.totals[player] += score;
    });
    this.history.push({
      contract: this.contract,
      scores: [...this.roundScores],
      totals: [...this.totals],
      finishOrder: [...this.finishOrder]
    });
    this.phase = "contract_complete";
  }

  publicView(player) {
    return {
      contract: this.contract,
      hand: [...this.hands[player]],
      handCounts: this.hands.map((hand) => hand.length),
      trick: this.trick.map((play) => ({ ...play })),
      board: JSON.parse(JSON.stringify(this.board)),
      playedCards: [...this.playedCards],
      voidSuits: this.voidSuits.map((set) => new Set(set)),
      currentPlayer: this.currentPlayer,
      openingPlay: this.openingPlay,
      trickNumber: this.trickNumber,
      finishOrder: [...this.finishOrder]
    };
  }
}
