# Discord Voice Pull Bot

A Discord bot that lets users request to pull someone from their current voice channel into theirs, with a one-click Accept/Decline flow. The bot tracks pull relationships in SQLite so the puller can return the user back to their original channel later.

## Features

- Pull request with interactive buttons (Accept/Decline)
- Moves the user to the puller’s voice channel on acceptance
- Tracks original channel in SQLite
- Return command to send the user back to their original voice channel
- Clear, English commands: `.pull` and `.return`

## Requirements

- Node.js 18+
- A Discord bot token with proper intents enabled (Server Members Intent and Message Content Intent)
- Permissions: the bot needs `Move Members` for voice channels

## Installation

```bash
git clone https://github.com/anoosh-nasratyar/ses_cekme_botu.git
cd ses_cekme_botu
npm install
```

## Configuration

Create a `.env` file in the project root:


Ensure the bot has the following Gateway Intents enabled in the Discord Developer Portal:
- `Guilds`
- `GuildVoiceStates`
- `GuildMessages`
- `MessageContent`

## Running

```bash
npm start
```

On startup, the bot logs in using `BOT_TOKEN`. If the token is missing, the process should fail fast.

## Commands

- `.pull @user`
  - Sends an interactive pull request to the mentioned user.
  - The embed shows “From” (user’s current voice channel) and “To” (your voice channel).
  - Only the mentioned user can Accept or Decline.

- `.return @user`
  - Returns the user you previously pulled back to their original voice channel.
  - Only works for users you have pulled and while the original channel still exists.

## Behavior Details

- Accepting a pull:
  - Stores a record in SQLite: `puller_id`, `pulled_id`, `guild_id`, `original_channel_id`, and `timestamp`
  - Moves the user to the puller’s voice channel

- Declining a pull:
  - Updates the original message with a “Pull Request Declined” embed

- Returning a user:
  - Checks the recorded relationship
  - Moves the user back to the original voice channel and removes the relationship

## Data Storage

SQLite database file: `voice_pulls.db`

Schema:
```sql
CREATE TABLE IF NOT EXISTS pull_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puller_id TEXT NOT NULL,
  pulled_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  original_channel_id TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Project Structure

- `main.js` — bot implementation, commands, and interaction handling
- `package.json` — metadata, scripts, dependencies
- `.env` — bot token (ignored by Git)
- `voice_pulls.db` — SQLite database (ignored by Git)
- `.gitignore` — ignores secrets and runtime artifacts

## Deployment

- Invite the bot to your server with `Move Members` permission
- Run on a service like PM2, Docker, or a hosted Node environment
- Keep `.env` out of source control (already ignored)

## Troubleshooting

- Permission errors when moving users:
  - Ensure the bot’s role is above the user’s role and has `Move Members`
- Command not responding:
  - Verify the bot is online and has `MessageContent` intent
- 403 pushing to GitHub:
  - Ensure you push using the correct GitHub account with repository access
  - Use HTTPS with a Personal Access Token or SSH keys

## Contributing

Issues and pull requests are welcome. Please open issues for bugs or feature requests.

## License

ISC
