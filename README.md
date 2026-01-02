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