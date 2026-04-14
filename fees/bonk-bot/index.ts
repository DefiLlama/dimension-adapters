import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const inflatedFees = [1712275200] // 2024-04-05, Inflated fees (22M fees for 48M volume)

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

  if (!inflatedFees.includes(options.startOfDay)){
    dailyFees.addUSDValue(Number(data[0].dailyFees), 'BonkBot Fees');
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}


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
  breakdownMethodology: {
    Fees: {
      ['BonkBot Fees']: "All trading fees paid by BonkBot users"
    },
  }
}

export default adapter;
