# Adapters

Find the instructions to list, write, test and submit an adapter [here](https://docs.llama.fi/list-your-project/other-dashboards)

## Install dependencies

`pnpm i`

## test adapter commands

`pnpm test fees bitcoin`

`pnpm test fees bitcoin 2025-10-10`

## Adding custom RPC URLs

Create an `.env` file and add custom RPC URLs using the `{CHAIN}_RPC` format (use uppercase chain name):

```
ETHEREUM_RPC="https://yourcustomrpc.com"
```

## Graph API Key Setup

Some adapters use The Graph hosted subgraphs which require API keys for continued access beyond free tier limits. Create an `.env` file and add:

```
GRAPH_API_KEY="your_graph_api_key_here"
```

Get your API key from [The Graph Studio](https://thegraph.com/studio/).