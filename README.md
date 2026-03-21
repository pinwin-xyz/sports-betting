# sports-betting

Decentralized sports betting for AI agents — built on [Azuro](https://azuro.org) and Polygon, powered by [Pinwin](https://pinwin.xyz).

Plug any AI agent into live sports odds and on-chain bet execution in minutes.

## Integrations

| Channel | Package | Status |
|---------|---------|--------|
| [ClawHub](https://clawhub.ai) | `#sports-betting` | ✅ Live |
| [MCP](https://modelcontextprotocol.io) (Claude, GPT, etc.) | [`sports-betting-mcp`](https://www.npmjs.com/package/sports-betting-mcp) | ✅ Live |
| OpenAI Function Calling | `openai/sports-betting-openai.json` | ✅ Live |
| Custom GPT (GPT Store) | coming soon | 🔜 |
| ElizaOS | coming soon | 🔜 |
| Coinbase AgentKit | coming soon | 🔜 |

## What it does

- **Browse games** — fetch live and prematch odds across NBA, NHL, NFL, Premier League, and 30+ leagues
- **Place bets** — sign and submit EIP-712 bets on-chain via Pinwin/Azuro on Polygon
- **Check results** — query bet history, status, and claimable winnings
- **Claim winnings** — redeem won/canceled bets on-chain
- **Auto-notify** — get notified automatically when your bet resolves (MCP/ClawHub)

## Quick start

### MCP (Claude Desktop, any MCP-compatible LLM)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sports-betting": {
      "command": "npx",
      "args": ["sports-betting-mcp"],
      "env": {
        "BETTOR_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

### OpenAI Function Calling

```python
import json, openai

with open("openai/sports-betting-openai.json") as f:
    tools = json.load(f)

response = openai.OpenAI().chat.completions.create(
    model="gpt-4o",
    tools=tools,
    messages=[{"role": "user", "content": "Show me NBA games tonight"}]
)
```

### ClawHub

Search `#sports-betting` in [ClawHub](https://clawhub.ai) and install directly into your agent.

## Repository structure

```
sports-betting/
├── clawhub/                      # ClawHub skill
│   ├── SKILL.md                  # Agent instructions
│   └── scripts/                  # Node.js execution scripts
│       ├── get-games.js          # Fetch games with odds
│       ├── place-bet.js          # Place bet on-chain
│       └── watch-bets.js         # Auto result notification
├── mcp/                          # MCP server (sports-betting-mcp on npm)
│   └── src/
│       ├── index.js              # MCP server entry point
│       ├── constants.js
│       ├── http.js
│       ├── wallet.js
│       └── tools/
│           ├── get-games.js
│           ├── place-bet.js
│           └── bets.js
└── openai/                       # OpenAI Function Calling
    ├── sports-betting-openai.json  # Tools schema
    └── sports-betting-openai.md   # Integration guide
```

## Requirements

- Node.js ≥ 18
- A wallet with USDT and POL (gas) on Polygon
- Your wallet private key (`BETTOR_PRIVATE_KEY`)

## Built with

- [Azuro Protocol](https://azuro.org) — decentralized betting protocol
- [Pinwin](https://pinwin.xyz) — Azuro frontend and agent API
- [viem](https://viem.sh) — Ethereum interactions
- [Model Context Protocol](https://modelcontextprotocol.io) — MCP server

## License

MIT
