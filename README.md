# Numino

**The forehead-number party game, online.** Everyone gets a number they can't see. Everyone else can. Ask questions out loud until you work out yours.

**[Play now](https://guess-production-d424.up.railway.app)** · [How it's built](docs/ARCHITECTURE.md) · [Roadmap](improvements.md) · [Report a bug](https://github.com/dfrico/numino/issues)

<!-- hero screenshot: docs/screenshots/hero.png (pending) -->

Numino runs the room. The talking happens wherever you already are: around a table, on a call, in a Discord channel. The app tracks three things and nothing else: **who can see which number, whose turn it is, and who has solved theirs.**

## How to play

1. One person creates a room with a name and a password. They're the host.
2. Everyone else joins from their phone with the same name and password, and picks a name and an emoji.
3. The host deals. Each player gets a different number from 1 to 100. You're the only one who can't see yours.
4. On your turn, ask the group anything. "Is it above 50?" "Is it a prime?" "Would I be okay with that many dollars?" Everyone else can see your number and answers.
5. When you're confident, hit **I think I know it** and type the number. The server checks it and confirms or rejects.
6. Right or wrong, a guess ends your turn. When everyone has solved theirs, every number is revealed.

Small numbers are funnier, so they come up far more often. About 63% of deals are 20 or below, and 69 is dealt about as often as 40.

## Why it works

- **You genuinely can't see your own number.** The server never sends it to your device. Not hidden with CSS, not obscured, absent from the payload. Opening devtools gets you nothing.
- **The server is the referee.** Guesses are checked server-side, so nobody can fake a solve to skip their turn.
- **Refresh-proof.** Drop the connection, reload, switch networks: you come back as the same player with the same number.
- **The room never gets stuck.** If the host disappears, the role passes to the next connected player after 30 seconds.
- **Made for phones.** Full mobile layout, emoji avatars, confetti for every solve, short sound cues with a mute toggle.

## Features

**Game**: server-enforced number secrecy, visible turn order with an active-turn highlight, server-refereed guesses, no two players share a number, mid-game joiners are dealt in at the end of the order.

**Solved state**: the number is revealed to everyone, the player's cell turns green with a check, their row in the turn order is struck through, confetti and a chime fire for the whole room, a progress bar tracks solved against total.

**Rooms and sessions**: the room name doubles as the code, passwords are checked server-side, identity survives a refresh, a reconnect banner shows when the socket drops, and disconnecting is distinct from leaving or being kicked.

**Host controls**: start (two players minimum), kick, end the game early and reveal everything, deal again for a rematch.

## Run it yourself

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

The server prints a local URL and a network URL. **Share the network one**: this is an in-person game played on phones, so the server binds to all interfaces by default. Override with `HOST` and `PORT`. Set `NEXT_PUBLIC_SUPPORT_URL` at build time to a tip-jar page (Ko-fi, GitHub Sponsors) and the end-of-game screen shows a "Buy the host a coffee" link; leave it unset and nothing shows.

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                                |
| `npm run build`     | Production build                                          |
| `npm start`         | Production server                                         |
| `npm test`          | 96 end-to-end socket checks (needs a server running)      |
| `npm run typecheck` | `tsc --noEmit`                                            |
| `npm run lint`      | ESLint                                                    |

Deploys as a single long-lived Node process (Railway, Fly). Vercel is not a target, since serverless can't hold a WebSocket.

## Under the hood

One Node process serves the Next.js app and the socket.io server on a single port. Game rules are pure functions with no I/O. Rooms live in an in-memory store behind a small interface, so moving to Postgres or Redis is a second implementation and nothing else. Prometheus metrics are served on loopback.

The full write-up is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the number-hiding invariant and why broadcast is per-socket, the server-as-referee model, the dealing distribution, turn order, reconnection tokens, the metrics, the socket event reference, how the test suite reads a player's number without ever seeing their own payload, and the known limitations.

Stack: Next.js 16, React 19, socket.io 4, TypeScript, Tailwind 4.

## Status

Live and playable. Rooms are held in memory, so a server restart drops them, which is fine for a party and is the first thing to change before persistence matters. What's next is in [improvements.md](improvements.md).

## License

[AGPL-3.0](LICENSE). Built by [Daniel Fernández](https://dfrico.com).
