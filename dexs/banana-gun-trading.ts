import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Log topics fetched from onchain tx history from ethereum txs 
const BANANA_GUN_SWAP_TOPIC = "0x9f849d23f4955d98202378ea318f2b0c7533695d3c9fb2a3931f0f919fa8c420";
const BANANA_GUN_SELL_OUTPUT_TOPIC = "0x522881958b3c4a6fc0840ad3b7fb947b881edc28c004245a62541647422ade97";

const chainConfig: Record<string, { start: string; router: string }> = {
  [CHAIN.ETHEREUM]: {
    start: "2023-12-02",
    router: "0x3328f7f4a1d1c57c35df56bbf0c9dcafca309c49",
  },
  [CHAIN.BLAST]: {
    start: "2024-02-28",
    router: "0x461efe0100be0682545972ebfc8b4a13253bd602",
  },
  [CHAIN.BASE]: {
    start: "2024-03-05",
    router: "0x1fba6b0bbae2b74586fba407fb45bd4788b7b130",
  },
  [CHAIN.SONIC]: {
    start: "2024-12-16",
    router: "0xdc13700db7f7cda382e10dba643574abded4fd5b",
  },
  [CHAIN.BSC]: {
    start: "2024-03-15",
    router: "0x461efe0100be0682545972ebfc8b4a13253bd602",
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-02-10",
    router: "0x461efe0100be0682545972ebfc8b4a13253bd602",
  },
  [CHAIN.SOLANA]: {
    start: "2024-07-20",
    router: "BANANAjs7FJiPQqJTGFzkZJndT9o7UmKiYYGaJz6frGu",
  },
};

const fetchEvm = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();
  const router = chainConfig[chain].router;

  const [swapLogs, sellOutputLogs] = await Promise.all([
    getLogs({
      target: router,
      topic: BANANA_GUN_SWAP_TOPIC,
      onlyArgs: false,
    }),
    getLogs({
      target: router,
      topic: BANANA_GUN_SELL_OUTPUT_TOPIC,
      onlyArgs: false,
    }),
  ]);
  const sellTxs = new Set<string>();

  for (const log of sellOutputLogs) {
    const txHash = log.transactionHash?.toLowerCase();
    if (txHash) sellTxs.add(txHash);

    if (BigInt(log.data) > 0n) dailyVolume.addGasToken(log.data);
  }

  for (const log of swapLogs) {
    const txHash = log.transactionHash?.toLowerCase();
    // Exclude swap logs where we find sellLogs, as buy only emit swapLogs but sell emit swapLogs as well as sellLogs.
    if (!txHash || sellTxs.has(txHash)) continue;

    const amountIn = `0x${log.data.slice(2, 66)}`;
    if (BigInt(amountIn) > 0n) dailyVolume.addGasToken(amountIn);
  }

  return { dailyVolume };
};

const fetchSolana = async (options: FetchOptions) => {
  const { router } = chainConfig[options.chain];
  const [row] = await queryDuneSql(options, `
    WITH routed_swaps AS (
      SELECT
        trades.tx_id,
        MAX(trades.amount_usd) AS amount_usd
      FROM dex_solana.trades AS trades
      WHERE TIME_RANGE
        AND EXISTS (
          SELECT 1
          FROM solana.account_activity a
          WHERE TIME_RANGE
            AND a.tx_id = trades.tx_id
            AND a.tx_success
            AND a.address = '${router}'
        )
      GROUP BY trades.tx_id
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS volume
    FROM routed_swaps
  `);

  return { dailyVolume: row?.volume };
};

// EVM routers are the Banana Gun trading contracts tracked by fees/banana-gun-trading.ts.
const fetch = (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) {
    const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
    }

    return fetchSolana(options);
  }

  return fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true,
  methodology: {
    Volume:
      "Total USD volume routed through banana routers.",
  },
};

export default adapter;
