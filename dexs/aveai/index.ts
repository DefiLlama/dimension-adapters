import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const chainConfig: Record<string, { start: string; router: string; swapEvent?: string }> = {
  [CHAIN.BASE]: {
    start: "2025-07-03",
    router: "0x282970F452371454332Ca522cE59F318a2C81484",
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.BSC]: {
    start: "2025-07-03",
    router: "0xd270845b7EBb0B013DfCCD9cA782a57Bfb7A359A",
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.ETHEREUM]: {
    start: "2025-07-15",
    router: "0x60943cb06b76A24431659165c81a03c16F1C325C",
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.HYPERLIQUID]: {
    start: "2025-05-31",
    router: "0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97",
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.SOLANA]: {
    start: "2025-01-17",
    router: "AveaiuA1emN71q9mS2QQ9BEWNAAHmp8sHSvwLFHQjufM",
  },
};

const fetchEVM = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const { router, swapEvent } = chainConfig[options.chain];

  const logs = await options.getLogs({
    target: router,
    eventAbi: swapEvent,
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
  const { router } = chainConfig[CHAIN.SOLANA];

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
  Volume: "Total USD volume processed by ave.ai router contracts.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  methodology,
};

export default adapter;
