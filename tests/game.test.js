import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACTS,
  PeskacGame,
  SEVENS_RANKS,
  contractPoints,
  createDeck,
  isTrickContractComplete,
  legalSevensCards,
  legalTrickCards,
  placeSevenCard,
  trickWinner
} from "../src/game.js";
import { chooseSevenCard, chooseTransferCard, chooseTrickCard } from "../src/ai.js";

const deck = createDeck();
const byId = (id) => deck.find((card) => card.id === id);

test("contracts are played with Derri third", () => {
  assert.deepEqual(CONTRACTS.map((contract) => contract.id), ["hearts", "queens", "pig", "tricks", "sevens"]);
});

test("deck contains 52 unique cards", () => {
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
});

test("players must follow suit", () => {
  const hand = [byId("2C"), byId("AS"), byId("QH")];
  const trick = [{ player: 0, card: byId("10S") }];
  assert.deepEqual(legalTrickCards(hand, trick).map((card) => card.id), ["AS"]);
});

test("opening leaders rotate across the four trick contracts without forcing 2♣", () => {
  const game = new PeskacGame({ random: () => 0.42 });
  for (let contract = 0; contract < 4; contract += 1) {
    game.startContract(contract);
    assert.equal(game.currentPlayer, contract);
    assert.equal(game.openingPlay, false);
    if (game.contract.id !== "pig") {
      assert.deepEqual(game.getLegalCards(contract), game.hands[contract]);
    }
  }

  game.startContract(4);
  assert.ok(game.hands[game.currentPlayer].some((card) => card.id === "7D"));
  assert.deepEqual(game.getLegalCards().map((card) => card.id), ["7D"]);
});

test("Derri forbids an early spade lead unless no other suit is available", () => {
  const mixedHand = [byId("2S"), byId("AS"), byId("5D")];
  assert.deepEqual(legalTrickCards(mixedHand, [], "S").map((card) => card.id), ["5D"]);

  const spadesOnly = [byId("2S"), byId("AS")];
  assert.deepEqual(legalTrickCards(spadesOnly, [], "S").map((card) => card.id), ["2S", "AS"]);

  const game = new PeskacGame({ random: () => 0.42 });
  game.startContract(2);
  game.openingPlay = false;
  game.currentPlayer = 0;
  game.hands[0] = [...mixedHand];
  game.trickNumber = 2;
  assert.deepEqual(game.getLegalCards(0).map((card) => card.id), ["5D"]);
  game.trickNumber = 3;
  assert.deepEqual(game.getLegalCards(0).map((card) => card.id), ["2S", "AS", "5D"]);
});

test("highest card in the led suit wins", () => {
  const trick = [
    { player: 0, card: byId("10S") },
    { player: 1, card: byId("AS") },
    { player: 2, card: byId("KH") },
    { player: 3, card: byId("KS") }
  ];
  assert.equal(trickWinner(trick).player, 1);
});

test("all four trick contracts score correctly", () => {
  const cards = [byId("KS"), byId("QH"), byId("5H"), byId("3C")];
  assert.equal(contractPoints("pig", cards), -16);
  assert.equal(contractPoints("queens", cards), -4);
  assert.equal(contractPoints("hearts", cards), -4);
  assert.equal(contractPoints("tricks", cards), 2);
});

test("penalty contracts end once all of their scoring cards are captured", () => {
  assert.equal(isTrickContractComplete("pig", [byId("KS")], 1), true);
  assert.equal(isTrickContractComplete("queens", [byId("QC"), byId("QD"), byId("QS")], 12), false);
  assert.equal(isTrickContractComplete("queens", [byId("QC"), byId("QD"), byId("QS"), byId("QH")], 4), true);
  assert.equal(isTrickContractComplete("hearts", deck.filter((card) => card.suit === "H"), 8), true);
  assert.equal(isTrickContractComplete("tricks", [], 12), false);
  assert.equal(isTrickContractComplete("tricks", [], 13), true);
});

test("Çupat stops after the trick containing the fourth queen", () => {
  const game = new PeskacGame({ random: () => 0.42 });
  game.startContract(1);
  game.openingPlay = false;
  game.currentPlayer = 0;
  game.playedCards = [byId("QC"), byId("QD"), byId("QS")];
  game.hands = [[byId("QH")], [byId("2H")], [byId("3H")], [byId("4H")]];

  game.playCard(0, "QH");
  game.playCard(1, "2H");
  game.playCard(2, "3H");
  const result = game.playCard(3, "4H");

  assert.equal(result.trickComplete, true);
  assert.equal(game.phase, "contract_complete");
  assert.equal(game.roundScores[0], -4);
});

test("sevens opens a suit with seven then grows adjacently", () => {
  const board = {};
  assert.deepEqual(legalSevensCards([byId("7D"), byId("8D"), byId("7C")], board, true).map((card) => card.id), ["7D"]);
  placeSevenCard(board, byId("7D"));
  const legal = legalSevensCards([byId("6D"), byId("8D"), byId("9D"), byId("7C")], board);
  assert.deepEqual(new Set(legal.map((card) => card.id)), new Set(["6D", "8D", "7C"]));
  placeSevenCard(board, byId("6D"));
  assert.equal(board.D.low, SEVENS_RANKS.indexOf("6"));
});

test("a Shtatat ace can complete either end of its suit", () => {
  const lowBoard = {};
  placeSevenCard(lowBoard, byId("7D"));
  for (const rank of ["6", "5", "4", "3", "2"]) placeSevenCard(lowBoard, byId(`${rank}D`));
  assert.deepEqual(legalSevensCards([byId("AD")], lowBoard).map((card) => card.id), ["AD"]);
  placeSevenCard(lowBoard, byId("AD"));
  assert.equal(lowBoard.D.aceSide, "low");

  const highBoard = {};
  placeSevenCard(highBoard, byId("7S"));
  for (const rank of ["8", "9", "10", "J", "Q", "K"]) placeSevenCard(highBoard, byId(`${rank}S`));
  assert.deepEqual(legalSevensCards([byId("AS")], highBoard).map((card) => card.id), ["AS"]);
  placeSevenCard(highBoard, byId("AS"));
  assert.equal(highBoard.S.aceSide, "high");
});

test("a blocked Shtatat player receives one card from the preceding player and passes", () => {
  const game = new PeskacGame({ random: () => 0.42 });
  game.startContract(4);
  game.openingPlay = false;
  game.board = {};
  game.hands = [
    [byId("AS")],
    [byId("2D")],
    [byId("3H")],
    [byId("QC"), byId("4C")]
  ];
  game.currentPlayer = 0;

  assert.equal(game.getLegalCards(0).length, 0, "recipient should be blocked");
  assert.equal(game.previousActivePlayer(0), 3);

  const result = game.transferCard(3, 0, "QC");

  assert.equal(result.card.id, "QC");
  assert.deepEqual(game.hands[0].map((card) => card.id), ["QC", "AS"]);
  assert.deepEqual(game.hands[3].map((card) => card.id), ["4C"]);
  assert.equal(game.currentPlayer, 1, "the blocked recipient passes instead of playing the received card immediately");
});

test("Shtatat rejects transfers when the recipient can play", () => {
  const game = new PeskacGame({ random: () => 0.42 });
  game.startContract(4);
  game.openingPlay = false;
  game.board = {};
  game.hands = [
    [byId("7S")],
    [byId("2D")],
    [byId("3H")],
    [byId("QC")]
  ];
  game.currentPlayer = 0;

  assert.throws(() => game.transferCard(3, 0, "QC"), /must be blocked/);
});

test("AI safely discards exposed penalty cards and spends the cheapest winner", () => {
  const game = new PeskacGame({ random: () => 0.42 });

  game.startContract(2);
  game.openingPlay = false;
  game.currentPlayer = 1;
  game.trick = [{ player: 0, card: byId("2C") }];
  game.playedCards = [byId("2C")];
  game.hands[1] = [byId("KS"), byId("5D")];
  assert.equal(chooseTrickCard(game, 1).id, "KS", "Derri AI should discard K♠ while void in the led suit");

  game.startContract(1);
  game.openingPlay = false;
  game.currentPlayer = 1;
  game.trick = [{ player: 0, card: byId("AH") }];
  game.playedCards = [byId("AH")];
  game.hands[1] = [byId("QH"), byId("2H")];
  assert.equal(chooseTrickCard(game, 1).id, "QH", "Çupat AI should shed a queen underneath an ace");

  game.startContract(3);
  game.openingPlay = false;
  game.currentPlayer = 3;
  game.trick = [
    { player: 0, card: byId("9S") },
    { player: 1, card: byId("3S") },
    { player: 2, card: byId("4S") }
  ];
  game.playedCards = game.trick.map((play) => play.card);
  game.hands[3] = [byId("10S"), byId("AS")];
  assert.equal(chooseTrickCard(game, 3).id, "10S", "Duart AI should use the cheapest card that wins when playing last");
});

test("Shtatat AI preserves a playable chain when possible", () => {
  const game = new PeskacGame({ random: () => 0.42 });
  game.startContract(4);
  game.openingPlay = false;
  game.currentPlayer = 1;
  game.board = { D: { low: SEVENS_RANKS.indexOf("7"), high: SEVENS_RANKS.indexOf("7") } };
  game.hands[1] = [byId("5D"), byId("6D"), byId("7C"), byId("KC")];
  assert.equal(chooseSevenCard(game, 1).id, "6D");
});

test("AI always chooses a legal card without reading opponent hands", () => {
  const game = new PeskacGame({ random: () => 0.42 });
  game.startSuite();
  const player = game.currentPlayer;
  const legalIds = new Set(game.getLegalCards(player).map((card) => card.id));
  const chosen = chooseTrickCard(game, player);
  assert.ok(legalIds.has(chosen.id));

  game.startContract(4);
  const sevensPlayer = game.currentPlayer;
  const sevensLegal = new Set(game.getLegalCards(sevensPlayer).map((card) => card.id));
  assert.ok(sevensLegal.has(chooseSevenCard(game, sevensPlayer).id));
});

test("computer players can complete full suites with conserved scoring", () => {
  for (let suite = 0; suite < 20; suite += 1) {
    const game = new PeskacGame();
    game.startSuite();

    for (let contract = 0; contract < 5; contract += 1) {
      let actions = 0;
      while (game.phase === "playing" && actions < 800) {
        const player = game.currentPlayer;
        const legal = game.getLegalCards(player);
        if (game.contract.id === "sevens" && legal.length === 0) {
          const donor = game.previousActivePlayer(player);
          game.transferCard(donor, player, chooseTransferCard(game, donor).id);
        } else {
          const card = game.contract.id === "sevens"
            ? chooseSevenCard(game, player)
            : chooseTrickCard(game, player);
          game.playCard(player, card.id);
        }
        actions += 1;
      }
      assert.equal(game.phase, "contract_complete", `contract ${contract + 1} should finish`);
      assert.ok(actions < 800, "contract should not loop indefinitely");
      if (contract < 4) game.startContract(contract + 1);
    }

    assert.equal(game.history.length, 5);
    assert.equal(game.totals.reduce((sum, score) => sum + score, 0), 28);
  }
});
