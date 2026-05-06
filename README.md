# Adapters

Find the instructions to list, write, test and submit an adapter [here](https://docs.llama.fi/list-your-project/other-dashboards)

## Agent skill

This repo includes an agent skill for AI-assisted DefiLlama dimension adapter authoring. It helps coding agents understand protocol details, validate whether a request belongs in `dimension-adapters`, suggest the likely DefiLlama repo or path when it does not, choose existing adapter patterns, helpers, and factories, implement dimension adapters in repo style, run `pnpm test`, and prepare PR metadata.

Install it with:

```bash
npx skills@latest add DefiLlama/dimension-adapters --skill defillama-dimension-adapter-author
```

The installer supports multiple coding agents, including Claude Code and Codex. It will prompt you to choose where to install the skill. Restart your agent after installing so it can discover the new skill.

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
