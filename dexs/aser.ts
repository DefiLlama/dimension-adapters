import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// ASER (https://aser.trade) routes every swap through the underlying Solana venues (pump.fun, PumpSwap,
// Raydium, Jupiter), so its volume double-counts those DEXs -> doublecounted. The 1% fee lands in this
// wallet inside the swap transaction; we use it to identify ASER-routed txs.
const ASER_FEE_WALLET = '5VmZHp6GwbLBHsp4f1CRogWV7RcfSk2KdSuxdyMe8LqD';

const fetch = async (options: FetchOptions) => {
    const now = Date.now()
    const tenHoursAgo = now - (10 * 60 * 60 * 1000)
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
        throw new Error("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay")
    }

    const result = await queryDuneSql(options, `
    WITH feeWalletActivity AS (
      SELECT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address = '${ASER_FEE_WALLET}'
        AND balance_change > 0
    ),
    aserTrades AS (
      SELECT
        t.tx_id,
        t.trader_id,
        t.amount_usd,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      JOIN feeWalletActivity a ON t.tx_id = a.tx_id
      WHERE TIME_RANGE
        AND t.trader_id != '${ASER_FEE_WALLET}'
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM aserTrades
    WHERE row_num = 1
  `);

    const dailyVolume = options.createBalances();
    dailyVolume.addUSDValue(result[0].daily_volume);
    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2026-11-01",
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    doublecounted: true,
    methodology: {
        Volume: "Total USD value of spot swaps routed through ASER (transactions that pay ASER's fee wallet), taken as one swap per trader per transaction so multi-hop routes aren't counted more than once.",
    },
};

export default adapter;
