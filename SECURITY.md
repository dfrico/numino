# Security

## Reporting

If you find a vulnerability, email hi@dfrico.com. Please don't open a public issue for security reports. You'll get a reply within a few days.

## What is and isn't a security boundary

Numino is a party game, and its threat model is "friends in the same room". Worth knowing before reporting:

- **A player's own number is a secret from that player.** The server never sends it to them. If you find a way for a client to learn its own number from the server, that's a real bug and I'd like to hear about it.
- **Resume tokens are secrets.** They're never broadcast. If a token leaks in any server-to-client frame, that's a bug.
- **Room passwords are a shared string, not an authentication system.** They stop strangers wandering in; they are not meant to resist a determined attacker, and there is no rate limiting on join attempts yet.
- **Players can tell each other numbers out loud.** That's the game, not a vulnerability.
