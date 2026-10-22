# discord-gambling

Discord bot for economy and gambling games, originally split from RaspBot.

## Commands

- `!balance` — check your wallet and next `!claim` availability
- `!claim` — claim $1000 every hour
- `!history [limit]` — show your recent transactions
- `!blackjack <bet>` — play blackjack (min bet $100, split allowed)
- `!dice [faces]` — roll a die (default 6 sides)
- `!help` — list available commands

## Running locally

```bash
cp .env.example .env
# edit .env and set DISCORD_TOKEN
npm install
npm start
```

## Running with Docker

```bash
cp .env.example .env
# edit .env and set DISCORD_TOKEN
docker compose up -d --build
```

The SQLite economy database is persisted in `data/economy.db` (ignored by Git).

## Environment variables

- `DISCORD_TOKEN` — required Discord bot token
- `PREFIX` — optional command prefix (default `!`)
- `DEBUG` — optional, set to `TRUE` to use `#` as prefix
