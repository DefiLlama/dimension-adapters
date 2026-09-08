import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const chainConfig: Record<string, { start: string; routers: string[]; swapEvent?: string }> = {
  [CHAIN.BASE]: {
    start: "2025-07-03",
    // The first router stopped emitting and Base has published 0 since 2026-07-24. The other two
    // are byte-identical redeployments of it under the same owner, 0x31781b4E7FB61756BD0a0Ef7850d5e7bf6270FC4,
    // which also owns the router on every other chain here.
    routers: [
      "0x282970F452371454332Ca522cE59F318a2C81484",
      "0x8a33650bbBd7622D7bF1b98d4ae851c134126C18",
      "0xf0eBB9bA1c3cd95c315f4F80197b85782E756e49",
    ],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.BSC]: {
    start: "2025-07-03",
    routers: ["0xd270845b7EBb0B013DfCCD9cA782a57Bfb7A359A"],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.ETHEREUM]: {
    start: "2025-07-15",
    routers: ["0x60943cb06b76A24431659165c81a03c16F1C325C"],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.HYPERLIQUID]: {
    start: "2025-05-31",
    routers: ["0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97"],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.SOLANA]: {
    start: "2025-01-17",
    routers: ["AveaiuA1emN71q9mS2QQ9BEWNAAHmp8sHSvwLFHQjufM"],
  },
};

const fetchEVM = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const { routers, swapEvent } = chainConfig[options.chain];

  const logs = await options.getLogs({
    targets: routers,
    eventAbi: swapEvent,
    flatten: true,
  });

  logs.forEach((log) => {
    if (log.tokenIn.toLowerCase() === ADDRESSES.GAS_TOKEN_2) {
      dailyVolume.addGasToken(log.amountIn);
    } else {
      dailyVolume.add(log.tokenIn, log.amountIn);
    }
  });

  return { dailyVolume };
};

const fetchSolana = async (options: FetchOptions): Promise<FetchResult> => {
  const [router] = chainConfig[CHAIN.SOLANA].routers;

  // Use 10 hours delay as dune has indexing delay for dex_solana.trades table
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const rows = await queryDuneSql(options, `
    WITH bot_trades AS (
      SELECT
        t.tx_id,
        t.trader_id,
        t.amount_usd,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      WHERE
        TIME_RANGE
        AND EXISTS (
          SELECT 1
          FROM solana.transactions tx
          WHERE
            TIME_RANGE
            AND tx.id = t.tx_id
            AND tx.success = true
            AND CONTAINS(tx.account_keys, '${router}')
        )
    )
    SELECT
      COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM bot_trades
    WHERE row_num = 1
  `) as { daily_volume?: string | number }[];

  return { dailyVolume: Number(rows[0]?.daily_volume) };
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  return fetchEVM(options);
};

const methodology = {
  Volume: "Total USD value of the swaps ave.ai routes through underlying DEXs. Double-counted, since those same swaps are also reported by the DEXs that actually execute them.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  doublecounted: true,
  methodology,
};

export default adapter;
