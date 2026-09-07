import {
  Dependencies,
  FetchOptions,
  FetchResult,
  SimpleAdapter,
} from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

// Data source: the 1inch-maintained Dune spellbook. oneinch.swaps carries the
// full EVM history (AR = Aggregation Router v1-v6 classic swaps since
// 2019-06-03, LO = Limit Order Protocol fills incl. Fusion intent settlements,
// CC = Fusion+ cross-chain swaps). Solana (Fusion program, live 2025-04-25)
// is NOT part of oneinch.swaps and comes from oneinch_solana.swaps instead.
//
// Per-chain start = min(block_date) actually present in the spellbook for that
// chain. Fantom volume died with the chain's Sonic migration (last real volume
// 2025), hence deadFrom.
const chainConfig: Record<
  string,
  { dune: string; start: string; deadFrom?: string }
> = {
  [CHAIN.ETHEREUM]: { dune: "ethereum", start: "2019-06-03" },
  [CHAIN.BSC]: { dune: "bnb", start: "2021-02-18" },
  [CHAIN.POLYGON]: { dune: "polygon", start: "2021-05-05" },
  [CHAIN.ARBITRUM]: { dune: "arbitrum", start: "2021-09-14" },
  [CHAIN.OPTIMISM]: { dune: "optimism", start: "2021-11-13" },
  [CHAIN.AVAX]: { dune: "avalanche_c", start: "2021-12-22" },
  [CHAIN.XDAI]: { dune: "gnosis", start: "2022-01-14" },
  [CHAIN.FANTOM]: {
    dune: "fantom",
    start: "2022-03-16",
    deadFrom: "2026-01-01",
  },
  [CHAIN.ERA]: { dune: "zksync", start: "2023-04-25" },
  [CHAIN.BASE]: { dune: "base", start: "2023-08-08" },
  [CHAIN.LINEA]: { dune: "linea", start: "2025-02-12" },
  [CHAIN.SOLANA]: { dune: "solana", start: "2025-04-25" },
  [CHAIN.SONIC]: { dune: "sonic", start: "2025-05-26" },
  [CHAIN.UNICHAIN]: { dune: "unichain", start: "2025-05-26" },
  [CHAIN.ROBINHOOD]: { dune: "robinhood", start: "2026-06-23" },
};

const prefetch = async (options: FetchOptions) => {
  const blacklisted = getDefaultDexTokensBlacklisted(CHAIN.BSC);

  // Count each user swap exactly once (measured on 2026-07-28, whole-history
  // proportions are similar):
  // - The Aggregation Router uses the Limit Order Protocol as a routing
  //   liquidity source, so an LO fill sharing a transaction with an AR swap is
  //   a slice of that swap's amount (~57% of limit-order fill volume) - summing
  //   both rows double-counts, therefore LO/CC rows inside AR transactions are
  //   excluded.
  // - Direct (non-resolver) LO fills emit a second row per fill flagged
  //   second_side - the same fill seen from the counterparty - excluded.
  // - Failed executions (present in the CC stream) are excluded.
  const sql_query = `
    WITH ar_txs AS (
      SELECT DISTINCT blockchain AS ar_blockchain, tx_hash AS ar_tx_hash
      FROM oneinch.swaps
      WHERE TIME_RANGE AND protocol = 'AR'
    )
    SELECT
      s.blockchain,
      sum(s.amount_usd) as volume_24h
    FROM oneinch.swaps s
    LEFT JOIN ar_txs ON s.blockchain = ar_blockchain AND s.tx_hash = ar_tx_hash
    WHERE
      TIME_RANGE
      AND NOT coalesce(element_at(s.flags, 'second_side'), false)
      AND coalesce(s.tx_success, true)
      AND coalesce(s.call_success, true)
      AND (s.protocol = 'AR' OR ar_tx_hash IS NULL)
      -- AND s.src_token_address NOT IN (${blacklisted})
      -- AND s.dst_token_address NOT IN (${blacklisted})
    GROUP BY 1

    UNION ALL

    SELECT
      'solana' as blockchain,
      coalesce(sum(amount_usd), 0) as volume_24h
    FROM oneinch_solana.swaps
    WHERE TIME_RANGE
  `;
  const result = await queryDuneSql(options, sql_query);

  return result;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const results = options.preFetchedResults || [];
  const chainData = results.find(
    (item: any) => item.blockchain === chainConfig[options.chain]?.dune,
  );

  return {
    dailyVolume: chainData ? chainData.volume_24h : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  prefetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "All swaps executed through 1inch, as indexed by the 1inch-maintained Dune spellbook (oneinch.swaps; oneinch_solana.swaps for the Solana Fusion program): Aggregation Router v1-v6 classic swaps, standalone Limit Order Protocol fills including Fusion intent settlements, and Fusion+ cross-chain swaps. Each user swap is counted once: Limit Order Protocol fills executed inside an Aggregation Router transaction are routing liquidity already included in the router swap amount and are excluded, duplicate second-side rows of direct limit-order fills are excluded, and failed executions are excluded.",
  },
};

export default adapter;
