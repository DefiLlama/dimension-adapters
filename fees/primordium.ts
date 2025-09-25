import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Trojan Fee Wallet: 9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco

const fetch = async (_a:any, _b:any, options: FetchOptions) => {  
  const query = `
    WITH botTrades AS (
        SELECT
            block_time,
            amount_usd,
            fee_usd
        FROM
            trojan_solana.bot_trades
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
  dailyFees.addUSDValue(data[0].dailyFees);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2024-01-04',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All trading fees paid by users while using Trojan bot.',
    Revenue: 'Fees collected by Trojan protocol.',
    ProtocolRevenue: "Fees collected by Trojan protocol.",
  }
};

export default adapter;
