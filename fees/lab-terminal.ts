import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const FEE_WALLET = "Eno27Pu6ok2nNwLTgNCLnFmY2YxQsAXecmrnnLvJeFYh";

  const combinedQuery = `
    WITH
      allFeePayments AS (
        SELECT
          tx_id,
          balance_change
        FROM
          solana.account_activity
        WHERE
          block_time >= from_unixtime(${options.startTimestamp})
          AND block_time <= from_unixtime(${options.endTimestamp})
          AND tx_success
          AND address = '${FEE_WALLET}'
          AND balance_change > 0
      ),
      botTrades AS (
        SELECT
          trades.tx_id,
          IF(
            token_sold_mint_address = 'So11111111111111111111111111111111111111112',
            token_sold_amount,
            token_bought_amount
          ) AS amount_usd
        FROM
          dex_solana.trades AS trades
          JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
        WHERE
          trades.block_time >= from_unixtime(${options.startTimestamp})
          AND trades.block_time <= from_unixtime(${options.endTimestamp})
          AND trades.trader_id != '${FEE_WALLET}'
      )
    SELECT
      COALESCE(SUM(allFeePayments.balance_change), 0) AS daily_fees,
      COALESCE(SUM(botTrades.amount_usd), 0) AS volume
    FROM
      allFeePayments
      LEFT JOIN botTrades ON allFeePayments.tx_id = botTrades.tx_id
  `;

  const res = await queryDuneSql(options, combinedQuery);
  dailyFees.add(ADDRESSES.solana.SOL, res[0].daily_fees);
  dailyVolume.add(ADDRESSES.solana.SOL, res[0].volume * 1e9);

  return {
    dailyFees,
    // dailyRevenue: dailyFees,  // skipping these for now as we are not excluding amount for referrals
    // dailyProtocolRevenue: dailyFees,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  chains: [CHAIN.SOLANA],
  fetch,
  start: "2025-06-29",
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading tokens fees paid by users",
    // ProtocolRevenue: "Trading fees are collected by Lab Terminal",
    // Revenue: "Trading fees are collected by Lab Terminal",
  },
};

export default adapter;
