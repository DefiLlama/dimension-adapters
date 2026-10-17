/*
  xStocks (Solana) — DEX volume adapter 

  Metric: USD volume of Solana DEX swaps where at least one side is an xStocks token
  Pattern: Dune-based Solana adapter, with the token list
  taken from Backed's token registry (same source as fees/backedfi)

  Reference query: "xstock total dex vol" on the official xStocks Dune dashboard
  (https://dune.com/queries/5393690), which reads dex_solana.trades filtered to xStocks mints
*/

import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getConfig } from "../../helpers/cache";
import { assertDuneSolanaIndexed } from "../../helpers/duneSolanaDex";

const TOKENS_API = "https://api.backed.fi/rest/tokens";

// Excluded to match official xStocks dashboard. On-chain notional is ~$1.34
// (0.00555 MCDx via DFlow aggregator), but multi-hop MMR pricing can inflate
// amount_usd 
const EXCLUDED_TX_IDS = [
  "26kRGiSJxFtRu7PajK9TZwauLHzyjKmhA3uZ47RYRYVFHZVqZYunn7priX4qCEw2K39CNAsr7DbmYxqNfCzig94o",
];

const BASE58_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Solana mints of every Backed/xStocks product. Trading-halted products are kept on purpose:
// they still have historical volume.
async function getSolanaMints(): Promise<string[]> {
  const response = await getConfig("backedfi/tokens", TOKENS_API);
  if (!Array.isArray(response?.nodes))
    throw new Error("Backed tokens config is unavailable");

  const mints = new Set<string>();
  for (const product of response.nodes) {
    for (const deployment of product.deployments ?? []) {
      if (deployment.network !== "Solana") continue;
      const address = String(deployment.address);
      const mint = address.startsWith("svm:") ? address.substring(4) : address;
      if (BASE58_MINT.test(mint)) mints.add(mint);
    }
  }
  return [...mints];
}

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const mints = await getSolanaMints();
  if (mints.length === 0) throw new Error("No xStocks Solana mints found");

  const mintList = mints.map((m) => `'${m}'`).join(", ");
  const excluded = EXCLUDED_TX_IDS.map((t) => `'${t}'`).join(", ");

  const query = `
    SELECT
      SUM(amount_usd) AS daily_volume
    FROM dex_solana.trades
    WHERE block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND (
        token_bought_mint_address IN (${mintList})
        OR token_sold_mint_address IN (${mintList})
      )
      AND tx_id NOT IN (${excluded})
  `;

  const data = await queryDuneSql(options, query);

  return {
    dailyVolume: data[0]?.daily_volume ?? 0,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2025-06-30",
  methodology: {
    Volume:
      "USD volume of all Solana DEX swaps where at least one token is an xStocks token (token list from Backed's registry), sourced from Dune's dex_solana.trades. This is market trading volume of the tokens, not volume of an xStocks-operated exchange.",
  },
};

export default adapter;
