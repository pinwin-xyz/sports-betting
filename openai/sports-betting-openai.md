# Pinwin — OpenAI Function Calling Schema

Drop-in tools definition for OpenAI Function Calling. Works with GPT-4o, GPT-4-turbo, and any model that supports tool_use.

## Quick start

```python
import json
import openai

# Load the tools schema
with open("openai-functions.json") as f:
    tools = json.load(f)

client = openai.OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    tools=tools,
    messages=[
        {
            "role": "system",
            "content": (
                "You are a sports betting assistant for Pinwin (pinwin.xyz), "
                "a decentralized betting platform on Polygon/Azuro. "
                "You help users browse live odds, place bets, check results, and claim winnings. "
                "Always confirm with the user before calling place_bet or claim_bets."
            )
        },
        {"role": "user", "content": "Show me NBA games tonight"}
    ]
)
```

## Tools

| Function | Description |
|----------|-------------|
| `get_games` | Fetch upcoming/live games with main market odds |
| `place_bet` | Place a bet on-chain via Pinwin (requires user confirmation) |
| `check_bets` | Check bet history and claimable winnings |
| `claim_bets` | Redeem won/canceled bets on-chain (requires user confirmation) |

## Executing tool calls

When the model returns a `tool_calls` response, route each call to the corresponding
`sports-betting-mcp` function (or your own implementation):

```python
import subprocess, json

def execute_tool(name, args):
    # Option A — delegate to sports-betting-mcp (recommended)
    result = subprocess.run(
        ["node", "/path/to/sports-betting-mcp/src/index.js"],
        input=json.dumps({"tool": name, "args": args}),
        capture_output=True, text=True,
        env={**os.environ, "BETTOR_PRIVATE_KEY": "0x..."}
    )
    return result.stdout

    # Option B — call your own backend endpoint
    # return requests.post(f"https://api.pinwin.xyz/agent/{name}", json=args).json()

for tool_call in response.choices[0].message.tool_calls:
    name   = tool_call.function.name
    args   = json.loads(tool_call.function.arguments)
    output = execute_tool(name, args)
    # Feed output back into messages as tool result
```

## Custom GPT (GPT Store)

To use this schema in a Custom GPT:

1. In the GPT builder, go to **Configure → Actions → Add Action**
2. Paste the contents of `openai-functions.json` as the schema
3. Set the server URL to your Pinwin API endpoint
4. Add `BETTOR_PRIVATE_KEY` as an auth header (or handle server-side)

## Safety

- `place_bet` and `claim_bets` descriptions include explicit instructions to require user confirmation — these are read by the model and enforced at inference time.
- `conditionId` and `outcomeId` descriptions warn against reusing stale values from previous sessions.
- The 2% slippage on `minOdds` is handled by the execution layer (sports-betting-mcp), not the schema.
