# Adapters

Find the instructions to list, write, test and submit an adapter [here](https://docs.llama.fi/list-your-project/other-dashboards)

## Install dependencies

`pnpm i`

## test adapter commands

`pnpm test fees bitcoin`

`pnpm test fees bitcoin 2025-10-10`

Run only specific chains (5th argument):

`pnpm test fees cctp 2026-08-01 solana`

Multiple chains (comma-separated):

`pnpm test fees cctp 2026-08-01 stellar,solana`

On PowerShell, quote the chain list so the comma is not treated as an argument separator:

`pnpm test fees cctp 2026-08-01 "stellar,solana"`

## Adding custom RPC URLs

Create an `.env` file and add custom RPC URLs using the `{CHAIN}_RPC` format (use uppercase chain name):

```
ETHEREUM_RPC="https://yourcustomrpc.com"
```
