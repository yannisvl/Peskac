import {
  RANKS,
  SEVENS_RANKS,
  legalSevensCards,
  legalTrickCards,
  placeSevenCard,
  trickWinner
} from "./game.js";

function cardDanger(card, contractId) {
  if (contractId === "pig") return card.id === "KS" ? 18 : 0;
  if (contractId === "queens") return card.rank === "Q" ? 10 : 0;
  if (contractId === "hearts") return card.suit === "H" ? card.value : 0;
  return 0;
}

function pilePenalty(contractId, cards) {
  if (contractId === "pig") return cards.some((card) => card.id === "KS") ? 200 : 0;
  if (contractId === "queens") return cards.filter((card) => card.rank === "Q").length * 75;
  if (contractId === "hearts") return cards.filter((card) => card.suit === "H").length * 28;
  return 0;
}

function suitCount(hand, suit) {
  return hand.filter((card) => card.suit === suit).length;
}

function opponentHigherCount(card, hand, playedCards) {
  const known = new Set([...hand, ...playedCards].map((candidate) => candidate.id));
  return RANKS.slice(RANKS.indexOf(card.rank) + 1).filter((rank) => !known.has(`${rank}${card.suit}`)).length;
}

function remainingPenaltyCount(contractId, playedCards) {
  if (contractId === "pig") return playedCards.some((card) => card.id === "KS") ? 0 : 1;
  if (contractId === "queens") return 4 - playedCards.filter((card) => card.rank === "Q").length;
  if (contractId === "hearts") return 13 - playedCards.filter((card) => card.suit === "H").length;
  return 0;
}

function playersAfter(player, trickLength) {
  return Array.from({ length: 3 - trickLength }, (_, offset) => (player + offset + 1) % 4);
}

function knownVoidCount(view, suit, players = [0, 1, 2, 3]) {
  return players.filter((player) => view.voidSuits[player]?.has(suit)).length;
}

function shortSuitPlan(card, hand) {
  const count = suitCount(hand, card.suit);
  let score = (4 - Math.min(4, count)) * 11;
  if (count === 1) score += 18;
  if (["A", "K"].includes(card.rank)) score -= 24;
  return score;
}

function queenUrgency(queen, hand, playedCards) {
  const lowerCover = hand.filter((card) => card.suit === queen.suit && card.value < queen.value).length;
  const higherRemaining = ["K", "A"].filter((rank) =>
    !playedCards.some((card) => card.id === `${rank}${queen.suit}`)
  ).length;
  return Math.max(0, 3 - lowerCover) * 20 + (2 - higherRemaining) * 30;
}

function descendingRun(hand, card) {
  const ranks = new Set(hand.filter((candidate) => candidate.suit === card.suit).map((candidate) => candidate.rank));
  let length = 1;
  for (let index = RANKS.indexOf(card.rank) - 1; index >= 0; index -= 1) {
    if (!ranks.has(RANKS[index])) break;
    length += 1;
  }
  return length;
}

function evaluateTrickCard(card, view, player) {
  const { contract, hand, trick, playedCards } = view;
  const contractId = contract.id;
  const leading = trick.length === 0;
  const leadSuit = leading ? card.suit : trick[0].card.suit;
  const offSuit = !leading && card.suit !== leadSuit;
  const hypothetical = [...trick, { player, card }];
  const currentWinner = trickWinner(hypothetical);
  const currentlyWinning = currentWinner?.player === player;
  const lastToPlay = trick.length === 3;
  const laterPlayers = playersAfter(player, trick.length);
  const pile = hypothetical.map((play) => play.card);
  const remainingPenalty = remainingPenaltyCount(contractId, playedCards);
  let score = Math.random() * 0.35;

  if (contractId === "tricks") {
    const higherOpponents = opponentHigherCount(card, hand, playedCards);
    if (currentlyWinning) {
      score += lastToPlay ? 145 - card.value * 2.1 : 54 - higherOpponents * 17;
    } else {
      score -= card.value * 2.6;
    }
    if (leading) {
      const suitLength = suitCount(hand, card.suit);
      const run = descendingRun(hand, card);
      score += higherOpponents === 0 ? 125 : card.value * 1.8 - higherOpponents * 28;
      score += suitLength * 5 + run * 7;
      if (higherOpponents > 0 && suitLength <= 2 && ["K", "Q", "J"].includes(card.rank)) score -= 45;
    }
    return score;
  }

  if (offSuit) score += cardDanger(card, contractId) * 17 + card.value * 0.55;

  if (currentlyWinning) {
    const penalty = pilePenalty(contractId, pile);
    score -= penalty * (lastToPlay ? 2.3 : 1.1);
    score -= card.value * 0.7;
    if (!lastToPlay) {
      const futureVoids = knownVoidCount(view, leadSuit, laterPlayers);
      score -= futureVoids * remainingPenalty * (contractId === "pig" ? 75 : contractId === "queens" ? 22 : 7);
    }
  } else {
    score += card.value * 0.85;
    score += cardDanger(card, contractId) * 8;
    if (pilePenalty(contractId, pile)) score += 85;
  }

  if (leading) {
    const ownDanger = cardDanger(card, contractId);
    score += shortSuitPlan(card, hand) - card.value * 0.9 - ownDanger * 18;

    if (contractId !== "hearts" || card.suit !== "H") {
      const voidRisk = knownVoidCount(view, card.suit, [0, 1, 2, 3].filter((candidate) => candidate !== player));
      score -= voidRisk * remainingPenalty * (contractId === "pig" ? 55 : contractId === "queens" ? 18 : 5);
    }

    if (contractId === "pig") {
      const pigUnplayed = !playedCards.some((played) => played.id === "KS");
      const holdsPig = hand.some((candidate) => candidate.id === "KS");
      if (card.suit === "S" && pigUnplayed && !holdsPig && card.id !== "AS") score += 95 - card.value * 4;
      if (card.suit === "S" && holdsPig) score -= 160;
      if (card.id === "AS" && pigUnplayed) score -= 260;
      if (holdsPig && card.suit !== "S") score += shortSuitPlan(card, hand);
    }

    if (contractId === "hearts" && card.suit === "H") {
      const heartCount = suitCount(hand, "H");
      const opponentsVoid = knownVoidCount(view, "H", [0, 1, 2, 3].filter((candidate) => candidate !== player));
      score += card.value <= 8 && heartCount >= 3 ? 42 : -card.value * 3;
      score -= opponentsVoid * 18;
    }

    if (contractId === "queens") {
      const ownQueen = hand.find((candidate) => candidate.suit === card.suit && candidate.rank === "Q");
      if (ownQueen) score -= 55 + queenUrgency(ownQueen, hand, playedCards);
      else if (!hand.some((candidate) => candidate.rank === "Q") && !playedCards.some((played) => played.id === `Q${card.suit}`)) {
        score += card.value <= 9 ? 38 : -70;
      }
    }
  }

  if (contractId === "pig" && card.id === "KS") {
    const aceAlreadyBeatsIt = hypothetical.some((play) => play.card.id === "AS");
    if (offSuit || aceAlreadyBeatsIt) score += 900;
    else score -= 650;
  }

  if (contractId === "pig" && card.id === "AS" && !playedCards.some((played) => played.id === "KS")) {
    if (hypothetical.some((play) => play.card.id === "KS") && currentlyWinning) score -= 900;
    else if (currentlyWinning) score -= 140;
  }

  if (contractId === "queens" && card.rank === "Q") {
    const urgency = queenUrgency(card, hand, playedCards);
    if (offSuit || !currentlyWinning) score += 360 + urgency * 2;
    else score -= 180 + urgency;
  }

  if (contractId === "hearts" && card.suit === "H" && (offSuit || !currentlyWinning)) {
    score += card.value * 15;
  }
  return score;
}

export function chooseTrickCard(game, player) {
  const view = game.publicView(player);
  const forbiddenLeadSuit = view.contract.id === "pig" && view.trickNumber < 3 ? "S" : null;
  const legal = legalTrickCards(view.hand, view.trick, forbiddenLeadSuit);
  if (!legal.length) throw new Error("AI has no legal trick card.");
  return legal
    .map((card) => ({ card, score: evaluateTrickCard(card, view, player) }))
    .sort((a, b) => b.score - a.score)[0].card;
}

function countFutureMoves(hand, board, playedCard) {
  const simulatedHand = hand.filter((card) => card.id !== playedCard.id);
  const simulatedBoard = JSON.parse(JSON.stringify(board));
  placeSevenCard(simulatedBoard, playedCard);
  return legalSevensCards(simulatedHand, simulatedBoard).length;
}

function contiguousChain(hand, card) {
  const sameSuit = new Set(hand.filter((candidate) => candidate.suit === card.suit).map((candidate) => candidate.rank));
  const start = SEVENS_RANKS.indexOf(card.rank);
  let total = 0;
  if (card.rank === "A") {
    const chains = [];
    for (const [startIndex, direction] of [[1, 1], [SEVENS_RANKS.length - 1, -1]]) {
      let chain = 0;
      for (let index = startIndex; index >= 1 && index < SEVENS_RANKS.length; index += direction) {
        if (!sameSuit.has(SEVENS_RANKS[index])) break;
        chain += 1;
      }
      chains.push(chain);
    }
    return Math.max(...chains);
  }
  for (const direction of [-1, 1]) {
    for (let index = start + direction; index >= 0 && index < SEVENS_RANKS.length; index += direction) {
      if (!sameSuit.has(SEVENS_RANKS[index])) break;
      total += 1;
    }
  }
  return total;
}

export function chooseSevenCard(game, player) {
  const view = game.publicView(player);
  const legal = legalSevensCards(view.hand, view.board, view.openingPlay);
  if (!legal.length) return null;
  const precedingPlayer = [1, 2, 3, 4]
    .map((offset) => (player - offset + 4) % 4)
    .find((candidate) => view.handCounts[candidate] > 0);
  const precedingCount = precedingPlayer === undefined ? 0 : view.handCounts[precedingPlayer];

  return legal
    .map((card) => {
      const future = countFutureMoves(view.hand, view.board, card);
      const chain = contiguousChain(view.hand, card);
      const opensSuit = !view.board[card.suit];
      let score = future * 34 + chain * 10 + Math.random();
      if (future > 0) score += 36;
      else if (view.hand.length > 1) score -= 78;
      if (opensSuit) score += chain ? chain * 16 : legal.length > 1 ? -72 : -24;
      if (precedingCount <= 2 && future === 0) score -= 90;
      if (view.hand.length <= 3) score += future * 16;
      return { card, score };
    })
    .sort((a, b) => b.score - a.score)[0].card;
}

export function chooseTransferCard(game, donor) {
  const view = game.publicView(donor);
  const board = view.board;
  return [...view.hand]
    .map((card) => {
      const legalNow = legalSevensCards([card], board).length > 0;
      const rankIndex = SEVENS_RANKS.indexOf(card.rank);
      const suitState = board[card.suit];
      let distance = 6;
      if (suitState && card.rank === "A") {
        distance = Math.min(Math.max(0, suitState.low - 1), Math.max(0, SEVENS_RANKS.length - 1 - suitState.high));
      } else if (suitState) distance = Math.min(Math.abs(rankIndex - suitState.low), Math.abs(rankIndex - suitState.high));
      else distance = Math.abs(rankIndex - SEVENS_RANKS.indexOf("7"));

      const unlockRanks = card.rank === "A"
        ? ["2", "K"]
        : [rankIndex < 6 ? SEVENS_RANKS[rankIndex + 1] : rankIndex > 6 ? SEVENS_RANKS[rankIndex - 1] : null];
      const controlsUnlock = unlockRanks.some((rank) => rank && view.hand.some((candidate) =>
        candidate.id === `${rank}${card.suit}`
      ));
      let score = (legalNow ? -190 : 45) + distance * 13 + Math.random();
      if (!suitState && card.rank !== "7") score += 32;
      if (controlsUnlock) score += 58;
      if (card.rank === "7") score -= 180;
      if (["6", "8"].includes(card.rank)) score -= 55;
      return { card, score };
    })
    .sort((a, b) => b.score - a.score)[0].card;
}
