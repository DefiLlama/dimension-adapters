import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Ride executes trade intents on behalf of DAO treasuries on Solana. Every fill is an
// `execute_intent` outer instruction on the Ride program, which CPIs into an underlying
// router (Jupiter, DFlow) to perform the actual swap.
const RIDE_PROGRAM = "tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA";

// Anchor discriminator of `execute_intent` = sha256("global:execute_intent")[0..8].
// Filtering on it keeps perp settlement (`perp_finalize`, 8bc0ecbd6ca6e58a) out of spot
// aggregator volume - those fills are derivatives flow on Phoenix, not routed swaps.
const EXECUTE_INTENT_DISCRIMINATOR = "35822f9ae3dc7ad4";

const fetch = async (options: FetchOptions) => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const query = `
    WITH fill_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.raw.instructions
      WHERE program_id = '${RIDE_PROGRAM}'
        AND data_hex_first16 = '${EXECUTE_INTENT_DISCRIMINATOR}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
    ),
    hop_dedup AS (
      SELECT t.usd_amount
      FROM solana.dex.trades t
      INNER JOIN fill_txs f ON t.txn_id = f.txn_id
      WHERE t.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND t.block_timestamp < TO_TIMESTAMP_NTZ(${end})
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY t.txn_id, t.instruction_index
        ORDER BY t.usd_amount DESC NULLS LAST
      ) = 1
    )
    SELECT COALESCE(SUM(usd_amount), 0) AS volume
    FROM hop_dedup
  `;

  const data = await queryAllium(query);
  return {
    dailyVolume: data[0]?.volume ?? 0,
  };
};

const methodology = {
  Volume:
    "USD notional of swaps routed by Ride's `execute_intent` instruction on Solana (program tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA). Both directions of an intent are counted as separate swaps: the USDC -> token fill that opens a position and the token -> USDC fill that closes it, plus each individual DCA fill. Sourced from Allium solana.dex.trades, counting each outer instruction once (largest hop USD) so multi-hop Jupiter routes are not double-counted. Perp settlements (`perp_finalize`) are excluded - that is derivatives flow, not routed spot volume.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-03-21",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
