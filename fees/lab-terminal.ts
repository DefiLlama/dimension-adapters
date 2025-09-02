import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const FEE_WALLET = "Eno27Pu6ok2nNwLTgNCLnFmY2YxQsAXecmrnnLvJeFYh";

  const feesQuery = `
    SELECT
    SUM(balance_change) AS daily_fees
    FROM solana.account_activity
    WHERE
        block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND tx_success
        AND address = '${FEE_WALLET}' 
        AND balance_change > 0
    `;
  const resFees = await queryDuneSql(options, feesQuery);
  dailyFees.add(ADDRESSES.solana.SOL, resFees[0].daily_fees);

  const volumeQuery = `
      WITH
          allFeePayments AS (
          SELECT
          tx_id
          FROM
          solana.account_activity
          WHERE
          block_time >= from_unixtime(${options.startTimestamp})
          AND block_time <= from_unixtime(${options.endTimestamp})
          AND tx_success
          AND address = '${FEE_WALLET}' -- FeeWallet
          AND balance_change > 0 -- SOL fee payments
      ),
      botTrades AS (
          SELECT
          IF(
        token_sold_mint_address = 'So11111111111111111111111111111111111111112', -- WSOLAddress
        token_sold_amount,
        token_bought_amount
      ) AS amount_usd
          FROM
          dex_solana.trades AS trades
          JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
          LEFT JOIN prices.usd AS feeTokenPrices ON (
              feeTokenPrices.blockchain = 'solana'
              AND '${ADDRESSES.solana.SOL}' = toBase58 (feeTokenPrices.contract_address)
              AND date_trunc('minute', block_time) = minute
              AND minute >= from_unixtime(${options.startTimestamp})
              AND minute <= from_unixtime(${options.endTimestamp})
          )
          WHERE
              trades.block_time >= from_unixtime(${options.startTimestamp})
              AND trades.block_time <= from_unixtime(${options.endTimestamp})
              AND trades.trader_id != '${FEE_WALLET}' -- FeeWallet
      )
      SELECT
      SUM(amount_usd) as volume
      FROM
      botTrades
    `;
  const resVolume = await queryDuneSql(options, volumeQuery);
  dailyVolume.add(ADDRESSES.solana.SOL, resVolume[0].volume * 1e9);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  fetch,
  start: "2025-06-29",
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading tokens fees paid by users",
    ProtocolRevenue: "Trading fees are collected by Lab Terminal",
    Revenue: "Trading fees are collected by Lab Terminal",
  },
};

export default adapter;
