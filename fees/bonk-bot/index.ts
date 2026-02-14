import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    WITH botTrades AS (
        SELECT
            block_time,
            amount_usd,
            fee_usd
        FROM
            bonkbot_solana.bot_trades
        WHERE
            blockchain = 'solana'
            AND is_last_trade_in_transaction = true
            AND TIME_RANGE
    )
    SELECT
        SUM(fee_usd) AS dailyFees
    FROM
        botTrades
  `;
  const data = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(data[0].dailyFees, METRIC.TRADING_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}


const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Fees charged by Bonk Bot for executing trades on behalf of users on Solana',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'All trading fees are retained by the Bonk Bot protocol',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: 'All trading fees are retained by the Bonk Bot protocol',
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2023-08-23',
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees paid by users while using bot.",
    Revenue: "Trading fees are collected by Bonk Bot protocol.",
    ProtocolRevenue: "Trading fees are collected by Bonk Bot protocol.",
  },
  breakdownMethodology,
}

export default adapter;
