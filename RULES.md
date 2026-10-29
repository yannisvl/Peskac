# Peskaç Desktop

A complete, offline five-contract Peskaç game for one human player and three computer opponents.

## Included

- All five floors: Kupat, Çupat, Derri, Duart and Shtatat
- Contract-by-contract and cumulative scoring
- Three information-fair, contract-aware computer players
- Card counting, void-suit inference and different tactics for each contract
- Albanian Shtatat passing rule, including choosing a card when you are the donor
- Animated card table, legal-card highlighting, game log, rules and sound
- Works on Windows, macOS and Linux through Electron

## Run the desktop app

Install [Node.js](https://nodejs.org/) once, then open a terminal in this folder:

```bash
npm install
npm start
```

## Run tests

```bash
npm test
```

## Implemented house rules

- Four separate trick-taking deals, followed by Shtatat
- The opening leader rotates across the first four deals: You, Arben, Elira, then Besnik
- Players must follow suit; there are no trumps; ace is high
- Kupat: each heart is −2
- Çupat: each queen is −4
- Derri: K♠ is −16
- Duart: each trick is +2
- Kupat, Çupat and Derri end as soon as all of their scoring cards have been captured
- Spades cannot lead any of Derri's first three tricks unless the leader has no other suit
- Shtatat opens with 7♦; each ace can complete its suit beside either the 2 or the K
- A blocked Shtatat player passes, receives a chosen card from the preceding active player, and waits until a later turn to play again
- Shtatat finishers earn +32, +16, +8 and +4

The game logic is separated from the interface in `src/game.js`, so these house rules can be changed without redesigning the application.
