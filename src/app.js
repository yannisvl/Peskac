import {
  CONTRACTS,
  DEFAULT_PLAYERS,
  SEVENS_RANKS,
  SUITS,
  PeskacGame
} from "./game.js";
import { chooseSevenCard, chooseTransferCard, chooseTrickCard } from "./ai.js";

const game = new PeskacGame();
const HUMAN = 0;
const PLAYER_INITIALS = ["Y", "A", "E", "B"];
const PLACE_LABELS = ["1st", "2nd", "3rd", "4th"];
const TIMING = {
  cardVisible: 520,
  trickResultVisible: 1200,
  computerThink: 520,
  transferVisible: 1700
};

const elements = {
  progress: document.querySelector("#contract-progress"),
  scoreList: document.querySelector("#score-list"),
  dealLabel: document.querySelector("#deal-label"),
  contractBadge: document.querySelector("#contract-badge"),
  trickArea: document.querySelector("#trick-area"),
  turnMessage: document.querySelector("#turn-message"),
  handHint: document.querySelector("#hand-hint"),
  humanHand: document.querySelector("#human-hand"),
  gameLog: document.querySelector("#game-log"),
  contractTip: document.querySelector("#contract-tip"),
  modalLayer: document.querySelector("#modal-layer"),
  modalCard: document.querySelector("#modal-card"),
  toast: document.querySelector("#toast"),
  rulesButton: document.querySelector("#rules-button"),
  newSuiteButton: document.querySelector("#new-suite-button"),
  soundButton: document.querySelector("#sound-button")
};

let busy = false;
let pendingHumanTransfer = null;
let displayedCompletedTrick = null;
let displayedTransfer = null;
let logEntries = [];
let soundEnabled = true;
let modalReturn = null;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function cardMarkup(card, { legal = false, disabled = false, received = false } = {}) {
  return `
    <div class="playing-card ${card.color} ${legal ? "legal" : ""} ${disabled ? "disabled" : ""} ${received ? "received" : ""}" data-card-id="${card.id}">
      <span class="corner">${card.rank}<small>${card.symbol}</small></span>
      <span class="center-suit">${card.symbol}</span>
    </div>`;
}

function cardLabel(card) {
  return `${card.rank}${card.symbol}`;
}

function signed(number) {
  return number > 0 ? `+${number}` : `${number}`;
}

function addLog(message, mark = "♠") {
  logEntries.unshift({ message, mark });
  logEntries = logEntries.slice(0, 10);
}

function playSound(frequency = 360, duration = 0.045) {
  if (!soundEnabled) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch {
    // Audio is decorative; gameplay remains available if the system blocks it.
  }
}

function renderProgress() {
  elements.progress.innerHTML = CONTRACTS.map((contract, index) => {
    const status = game.contractIndex === index ? "active" : game.contractIndex > index ? "done" : "";
    const label = status === "active" ? contract.name : status === "done" ? "✓" : `${index + 1}`;
    return `<span class="progress-step ${status}" title="${contract.name}: ${contract.english}">${label}</span>`;
  }).join("");
}

function effectiveScore(player) {
  return game.totals[player] + (game.phase === "playing" ? game.roundScores[player] : 0);
}

function renderScores() {
  const scores = DEFAULT_PLAYERS.map((_, player) => effectiveScore(player));
  const leader = scores.indexOf(Math.max(...scores));
  elements.scoreList.innerHTML = DEFAULT_PLAYERS.map((name, player) => {
    const round = game.phase === "playing" ? game.roundScores[player] : 0;
    return `
      <div class="score-row ${player === leader && game.contract ? "leader" : ""}">
        <span class="score-avatar">${PLAYER_INITIALS[player]}</span>
        <span class="score-name">${name}<small>${player === HUMAN ? "Human player" : "Computer · Strong"}</small></span>
        <span class="score-value">${scores[player]}${round ? `<small class="round-delta">${signed(round)} this deal</small>` : ""}</span>
      </div>`;
  }).join("");
  elements.dealLabel.textContent = game.contract ? `Deal ${game.contractIndex + 1} / 5` : "Not started";
}

function renderSeats() {
  DEFAULT_PLAYERS.forEach((name, player) => {
    const seat = document.querySelector(`#player-${player}`);
    const count = game.hands[player]?.length ?? 0;
    const active = game.phase === "playing" && game.currentPlayer === player;
    const finishedPlace = game.finishOrder.indexOf(player);
    const status = finishedPlace >= 0 ? PLACE_LABELS[finishedPlace] : `${count} card${count === 1 ? "" : "s"}`;
    const backs = Array.from({ length: Math.min(7, count) }, () => '<i class="mini-card-back"></i>').join("");
    const giving = displayedTransfer?.donor === player;
    const receiving = displayedTransfer?.recipient === player;
    seat.className = `player-seat ${["south", "west", "north", "east"][player]} ${active ? "active" : ""} ${giving ? "giving" : ""} ${receiving ? "receiving" : ""}`;
    seat.innerHTML = `
      <div class="seat-profile">
        <span class="seat-avatar">${PLAYER_INITIALS[player]}</span>
        <span class="seat-meta"><strong>${name}</strong><span>${status}</span></span>
      </div>
      ${player === HUMAN ? "" : `<div class="mini-hand">${backs}</div>`}`;
  });
}

function renderContract() {
  if (!game.contract) return;
  elements.contractBadge.innerHTML = `
    <span class="contract-symbol">${game.contract.symbol}</span>
    <div><small>${game.contract.english}</small><strong>${game.contract.name}</strong></div>`;
  elements.contractTip.innerHTML = `<span class="tip-icon">✦</span><p>${game.contract.tip}</p>`;
}

function renderSevensBoard() {
  const board = `<div class="sevens-board">${SUITS.map((suit) => {
    const state = game.board[suit.id];
    const slots = [
      { rank: "A", aceSide: "low" },
      ...SEVENS_RANKS.slice(1).map((rank) => ({ rank, aceSide: null })),
      { rank: "A", aceSide: "high" }
    ];
    return `<div class="seven-lane">${slots.map(({ rank, aceSide }) => {
      const rankIndex = SEVENS_RANKS.indexOf(rank);
      const filled = state && (rank === "A" ? state.aceSide === aceSide : rankIndex >= state.low && rankIndex <= state.high);
      const available = state && rank === "A" && !state.aceSide && (
        (aceSide === "low" && state.low === 1) ||
        (aceSide === "high" && state.high === SEVENS_RANKS.length - 1)
      );
      const closed = state && rank === "A" && state.aceSide && state.aceSide !== aceSide;
      return `<span class="seven-slot ${filled ? "filled" : ""} ${available ? "available" : ""} ${closed ? "closed" : ""} ${rank === "A" ? "ace-end" : ""} ${suit.color}">${filled ? `${rank}${suit.symbol}` : rank === "A" && !closed ? "A" : "·"}</span>`;
    }).join("")}</div>`;
  }).join("")}</div>`;

  if (!displayedTransfer) return board;
  const { card, donor, recipient } = displayedTransfer;
  const recipientLabel = recipient === HUMAN ? "you" : DEFAULT_PLAYERS[recipient];
  return `${board}
    <div class="transfer-reveal">
      <div class="transfer-card">${cardMarkup(card)}</div>
      <div class="transfer-copy">
        <small>Could not play · passes</small>
        <strong>${DEFAULT_PLAYERS[donor]} gave ${cardLabel(card)} to ${recipientLabel}</strong>
      </div>
    </div>`;
}

function renderTrick() {
  if (game.contract?.id === "sevens") {
    elements.trickArea.innerHTML = renderSevensBoard();
    return;
  }
  const plays = displayedCompletedTrick ?? game.trick;
  elements.trickArea.innerHTML = plays.map((play) => `
    <div class="played-card player-${play.player}">${cardMarkup(play.card)}</div>`).join("");
}

function humanCanChoose() {
  return game.phase === "playing" && !busy && (game.currentPlayer === HUMAN || pendingHumanTransfer?.donor === HUMAN);
}

function renderHand() {
  const hand = game.hands[HUMAN] ?? [];
  const choosingTransfer = pendingHumanTransfer?.donor === HUMAN;
  const legalIds = new Set(
    choosingTransfer ? hand.map((card) => card.id) : game.currentPlayer === HUMAN ? game.getLegalCards(HUMAN).map((card) => card.id) : []
  );
  const canChoose = humanCanChoose();
  elements.humanHand.innerHTML = hand.map((card) =>
    cardMarkup(card, {
      legal: canChoose && legalIds.has(card.id),
      disabled: !canChoose || !legalIds.has(card.id),
      received: displayedTransfer?.recipient === HUMAN && displayedTransfer.card.id === card.id
    })
  ).join("");

  if (!game.contract) elements.handHint.textContent = "Your hand will appear here";
  else if (choosingTransfer) elements.handHint.textContent = `Choose a card to give ${DEFAULT_PLAYERS[pendingHumanTransfer.recipient]}`;
  else if (game.phase !== "playing") elements.handHint.textContent = "Contract complete";
  else if (game.currentPlayer === HUMAN && !busy) elements.handHint.textContent = "Choose a highlighted card";
  else elements.handHint.textContent = "Waiting for the table";
}

function renderLog() {
  elements.gameLog.innerHTML = logEntries.length
    ? logEntries.map((entry) => `<div class="log-entry"><span class="log-mark">${entry.mark}</span><span>${entry.message}</span></div>`).join("")
    : '<div class="log-entry"><span class="log-mark">✦</span><span>The table is ready.</span></div>';
}

function renderMessage() {
  elements.turnMessage.className = "turn-message";
  if (displayedTransfer) {
    const { card, donor, recipient } = displayedTransfer;
    const recipientLabel = recipient === HUMAN ? "You receive" : `${DEFAULT_PLAYERS[recipient]} receives`;
    elements.turnMessage.classList.add("transfer-message");
    elements.turnMessage.innerHTML = `<strong>${recipientLabel} ${cardLabel(card)}</strong> from ${DEFAULT_PLAYERS[donor]} and pass`;
  } else if (!game.contract) elements.turnMessage.textContent = "Start a suite when you are ready";
  else if (game.phase === "contract_complete") elements.turnMessage.textContent = `${game.contract.name} complete`;
  else if (pendingHumanTransfer?.donor === HUMAN) elements.turnMessage.textContent = `Give one card to ${DEFAULT_PLAYERS[pendingHumanTransfer.recipient]}`;
  else if (game.currentPlayer === HUMAN) {
    const legal = game.getLegalCards(HUMAN);
    elements.turnMessage.textContent = legal.length ? "Your turn" : "You are blocked — taking a card";
  } else elements.turnMessage.textContent = `${DEFAULT_PLAYERS[game.currentPlayer]} is thinking…`;
}

function render() {
  renderProgress();
  renderScores();
  renderSeats();
  renderContract();
  renderTrick();
  renderHand();
  renderLog();
  renderMessage();
}

function showModal(content, returnAction = null) {
  modalReturn = returnAction;
  elements.modalCard.innerHTML = content;
  elements.modalLayer.classList.add("open");
}

function closeModal() {
  elements.modalLayer.classList.remove("open");
  const callback = modalReturn;
  modalReturn = null;
  if (callback) callback();
  else if (game.phase === "playing") runTable();
}

function showWelcome() {
  showModal(`
    <div class="welcome-suits">♣ ♦ ♠ ♥</div>
    <h2>Take your seat.</h2>
    <p>Play a complete five-floor Peskaç suite against three contract-aware computer opponents. They count exposed cards and remember void suits, but never see your hand.</p>
    <div class="suite-preview">
      ${CONTRACTS.map((contract) => `<div class="preview-contract"><span>${contract.symbol}</span><small>${contract.name}</small></div>`).join("")}
    </div>
    <div class="modal-actions"><button class="primary-button" data-action="start-suite">Deal the cards</button></div>`);
}

function showRules() {
  const wasOpen = elements.modalLayer.classList.contains("open");
  showModal(`
    <div class="rules-content">
      <span class="eyebrow">Table rules</span>
      <h2>How this version plays</h2>
      <p>A 52-card deck is dealt equally. There are no trumps. You must follow the led suit; the highest card in that suit takes the trick and leads next. The opening leader rotates across the first four deals: You, Arben, Elira, then Besnik.</p>
      <h3>1 · Kupat</h3><p>Every captured heart scores −2. The deal ends after all thirteen hearts have been captured.</p>
      <h3>2 · Çupat</h3><p>Every captured queen scores −4. The deal ends after all four queens have been captured.</p>
      <h3>3 · Derri</h3><p>Capturing K♠ scores −16 and ends the deal. A player cannot lead spades during the first three tricks unless their hand contains only spades.</p>
      <h3>4 · Duart</h3><p>Every captured trick scores +2.</p>
      <h3>5 · Shtatat</h3><p>7♦ opens. Build each suit outward from seven. An ace can complete either end of its suit: beside the 2 or beside the K. If you cannot play, you pass; the preceding active player chooses one card to give you. You do not play the received card until a later turn. Finishing places score +32, +16, +8 and +4.</p>
      <p>All five results are added. The highest suite total wins.</p>
    </div>
    <div class="modal-actions"><button class="primary-button" data-action="close-modal">Back to table</button></div>`, wasOpen ? showWelcome : null);
}

function showContractSummary() {
  const history = game.history.at(-1);
  const order = [0, 1, 2, 3].sort((a, b) => history.scores[b] - history.scores[a]);
  const isLast = game.contractIndex === CONTRACTS.length - 1;
  showModal(`
    <span class="eyebrow">Contract ${game.contractIndex + 1} complete</span>
    <h2>${game.contract.name}</h2>
    <p>${game.contract.summary}. Here is how the deal changed the table.</p>
    <div class="summary-list">
      ${order.map((player, index) => `
        <div class="summary-row ${index === 0 ? "winner" : ""}">
          <span class="summary-place">${index + 1}</span>
          <span class="summary-name">${DEFAULT_PLAYERS[player]}</span>
          <span class="summary-round">${signed(history.scores[player])} deal</span>
          <span class="summary-total">${history.totals[player]}</span>
        </div>`).join("")}
    </div>
    <div class="modal-actions">
      <button class="primary-button" data-action="${isLast ? "suite-results" : "next-contract"}">${isLast ? "See final standings" : `Continue to ${CONTRACTS[game.contractIndex + 1].name}`}</button>
    </div>`);
}

function showSuiteResults() {
  const order = [0, 1, 2, 3].sort((a, b) => game.totals[b] - game.totals[a]);
  const winner = DEFAULT_PLAYERS[order[0]];
  showModal(`
    <div class="welcome-suits">♠ ♦ ♣ ♥</div>
    <span class="eyebrow">Five floors complete</span>
    <h2>${winner === "You" ? "You win the suite!" : `${winner} wins the suite.`}</h2>
    <p>All five contracts have been scored. Highest total takes the table.</p>
    <div class="summary-list">
      ${order.map((player, index) => `
        <div class="summary-row ${index === 0 ? "winner" : ""}">
          <span class="summary-place">${PLACE_LABELS[index]}</span>
          <span class="summary-name">${DEFAULT_PLAYERS[player]}</span>
          <span class="summary-round">${index === 0 ? "Winner" : "Final"}</span>
          <span class="summary-total">${game.totals[player]}</span>
        </div>`).join("")}
    </div>
    <div class="modal-actions"><button class="primary-button" data-action="start-suite">Play another suite</button></div>`);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function startSuite() {
  game.startSuite();
  pendingHumanTransfer = null;
  displayedCompletedTrick = null;
  displayedTransfer = null;
  logEntries = [];
  const openingText = game.currentPlayer === HUMAN ? "You lead." : `${DEFAULT_PLAYERS[game.currentPlayer]} leads.`;
  addLog(`<strong>${game.contract.name}</strong> begins. ${openingText}`, game.contract.symbol);
  closeModal();
  render();
  runTable();
}

function startNextContract() {
  const nextIndex = game.contractIndex + 1;
  game.startContract(nextIndex);
  pendingHumanTransfer = null;
  displayedCompletedTrick = null;
  displayedTransfer = null;
  logEntries = [];
  const openingText = game.currentPlayer === HUMAN ? "You lead." : `${DEFAULT_PLAYERS[game.currentPlayer]} leads.`;
  addLog(`<strong>${game.contract.name}</strong> begins. ${openingText}`, game.contract.symbol);
  closeModal();
  render();
  runTable();
}

async function animatePlay(player, card) {
  const result = game.playCard(player, card.id);
  if (result.trickComplete) displayedCompletedTrick = result.completedTrick;
  playSound(card.color === "red" ? 410 : 350);
  addLog(`<strong>${DEFAULT_PLAYERS[player]}</strong> played ${card.rank}${card.symbol}.`, card.symbol);
  render();
  await sleep(TIMING.cardVisible);

  if (result.trickComplete) {
    const pointsText = result.points ? ` · ${signed(result.points)} points` : "";
    addLog(`<strong>${DEFAULT_PLAYERS[result.winner]}</strong> took trick ${game.trickNumber}${pointsText}.`, "✦");
    render();
    playSound(result.points < 0 ? 180 : 520, 0.08);
    await sleep(TIMING.trickResultVisible);
    displayedCompletedTrick = null;
    render();
  }
  return result;
}

async function revealTransfer(result) {
  displayedTransfer = result;
  const recipientLabel = result.recipient === HUMAN ? "You" : DEFAULT_PLAYERS[result.recipient];
  addLog(`<strong>${recipientLabel}</strong> could not play, passed, and received ${cardLabel(result.card)} from ${DEFAULT_PLAYERS[result.donor]}.`, "↗");
  playSound(235);
  render();
  await sleep(TIMING.transferVisible);
  displayedTransfer = null;
  render();
}

async function runTable() {
  if (busy || game.phase !== "playing" || elements.modalLayer.classList.contains("open")) return;
  busy = true;
  render();

  while (game.phase === "playing") {
    if (elements.modalLayer.classList.contains("open")) {
      busy = false;
      render();
      return;
    }
    if (game.contract.id === "sevens" && game.getLegalCards().length === 0) {
      const recipient = game.currentPlayer;
      const donor = game.previousActivePlayer(recipient);
      if (donor === HUMAN) {
        pendingHumanTransfer = { donor, recipient };
        busy = false;
        addLog(`<strong>${DEFAULT_PLAYERS[recipient]}</strong> is blocked. Choose a card to give them.`, "↗");
        render();
        return;
      }

      const card = chooseTransferCard(game, donor);
      const result = game.transferCard(donor, recipient, card.id);
      await revealTransfer(result);
      continue;
    }

    if (game.currentPlayer === HUMAN) {
      busy = false;
      render();
      return;
    }

    const player = game.currentPlayer;
    render();
    await sleep(TIMING.computerThink);
    const card = game.contract.id === "sevens" ? chooseSevenCard(game, player) : chooseTrickCard(game, player);
    const result = await animatePlay(player, card);
    if (result.finished) addLog(`<strong>${DEFAULT_PLAYERS[player]}</strong> finished ${PLACE_LABELS[game.finishOrder.indexOf(player)]}.`, "★");
  }

  busy = false;
  render();
  await sleep(300);
  showContractSummary();
}

async function handleHumanCard(cardId) {
  if (busy || game.phase !== "playing") return;

  if (pendingHumanTransfer?.donor === HUMAN) {
    const { donor, recipient } = pendingHumanTransfer;
    const card = game.hands[donor].find((candidate) => candidate.id === cardId);
    if (!card) return;
    pendingHumanTransfer = null;
    busy = true;
    const result = game.transferCard(donor, recipient, card.id);
    await revealTransfer(result);
    busy = false;
    if (game.phase === "contract_complete") {
      await sleep(300);
      showContractSummary();
    } else runTable();
    return;
  }

  if (game.currentPlayer !== HUMAN) return;
  const card = game.getLegalCards(HUMAN).find((candidate) => candidate.id === cardId);
  if (!card) {
    const attemptedCard = game.hands[HUMAN].find((candidate) => candidate.id === cardId);
    const earlyDerriSpade = game.contract.id === "pig" && game.trick.length === 0 && game.trickNumber < 3 && attemptedCard?.suit === "S";
    showToast(earlyDerriSpade ? "Spades cannot lead the first three Derri tricks unless unavoidable." : "You must follow the suit that was led.");
    return;
  }
  busy = true;
  const result = await animatePlay(HUMAN, card);
  if (result.finished) addLog(`<strong>You</strong> finished ${PLACE_LABELS[game.finishOrder.indexOf(HUMAN)]}!`, "★");
  busy = false;
  if (game.phase === "contract_complete") {
    render();
    await sleep(300);
    showContractSummary();
  } else runTable();
}

elements.humanHand.addEventListener("click", (event) => {
  const card = event.target.closest("[data-card-id]");
  if (card) handleHumanCard(card.dataset.cardId);
});

elements.modalCard.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "start-suite") startSuite();
  else if (action === "next-contract") startNextContract();
  else if (action === "suite-results") showSuiteResults();
  else if (action === "close-modal") closeModal();
});

elements.rulesButton.addEventListener("click", showRules);
elements.newSuiteButton.addEventListener("click", () => {
  showModal(`
    <span class="eyebrow">New suite</span>
    <h2>Reshuffle the table?</h2>
    <p>The current five-floor suite will be replaced with a fresh deal.</p>
    <div class="modal-actions">
      <button class="secondary-button" data-action="close-modal">Keep playing</button>
      <button class="primary-button" data-action="start-suite">Start fresh</button>
    </div>`);
});
elements.soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  elements.soundButton.classList.toggle("muted", !soundEnabled);
  elements.soundButton.textContent = soundEnabled ? "♪" : "×";
  showToast(soundEnabled ? "Table sounds on" : "Table sounds off");
});

render();
showWelcome();
