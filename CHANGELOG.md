# Changelog

All notable changes to Numino are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Rooms with a name and password; the room name doubles as the join code.
- Server-enforced number secrecy: a player's own number is never sent to their device.
- Server-refereed guesses, one guess per turn, turn order visible to the whole room.
- Weighted dealing so small numbers come up more often; no two players share a number.
- Session resume after a refresh or dropped connection, with a separate resume token.
- Host controls: start, kick, end early, deal again. Host handoff after 30 seconds away.
- Mobile layout, emoji avatars, confetti and sound cues with a mute toggle.
- Prometheus metrics on a loopback port.
- End-to-end socket test suite (96 checks).
- AGPL-3.0 license.

### Changed
- Renamed from "guess" to Numino.
