# pinwin-mcp

MCP server for [Pinwin](https://pinwin.xyz) — decentralized sports betting on Azuro/Polygon.

Connects any MCP-compatible LLM (Claude, GPT-4, etc.) to live sports odds and on-chain bet execution.

## Tools

| Tool | Description |
|------|-------------|
| `get_games` | Fetch upcoming/live games with main market odds |
| `place_bet` | Place a bet on-chain via Pinwin (requires confirmation) |
| `check_bets` | Check bet history and claimable winnings |
| `claim_bets` | Redeem won/canceled bets on-chain (requires confirmation) |

## Setup

### 1. Prerequisites

- Node.js ≥ 18
- A wallet with USDT and POL (for gas) on Polygon
- Your wallet's private key

### 2. Install

```bash
npm install -g pinwin-mcp
```

Or run directly with npx (no install needed):

```bash
npx pinwin-mcp
```

### 3. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pinwin": {
      "command": "npx",
      "args": ["pinwin-mcp"],
      "env": {
        "BETTOR_PRIVATE_KEY": "0xyour_private_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see Pinwin tools available in the tools panel.

### 4. Optional: custom RPC

Add `POLYGON_RPC_URL` to the env block for a dedicated RPC endpoint:

```json
"env": {
  "BETTOR_PRIVATE_KEY": "0x...",
  "POLYGON_RPC_URL": "https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY"
}
```

## Usage examples

Once configured, talk to Claude naturally:

- *"Show me NBA games tonight"*
- *"What are the odds for the Premier League games this weekend?"*
- *"Place 2 USDT on the Celtics to win"*
- *"Check my bets"*
- *"Claim my winnings"*

## Security

- Your private key never leaves your machine — it's only read from the env var by the local MCP process.
- `place_bet` and `claim_bets` always confirm before executing on-chain.
- The server validates payload integrity (stake amount, conditionId, outcomeId, contract address) before signing.

## Supported sports

| You say | Azuro slug |
|---------|-----------|
| nba / basketball | basketball |
| nhl / hockey / ice-hockey | ice-hockey |
| nfl / american-football | american-football |
| mlb / baseball | baseball |
| football / soccer | football |
| tennis | tennis |
| mma | mma |

## License

MIT
