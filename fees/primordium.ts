import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Trojan Fee Wallet: 9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const query = `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND tx_success
        AND address = '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco'
        AND balance_change > 0 
    ),
    botTrades AS (
      SELECT
        trades.tx_id,
        MAX(fee_token_amount) AS fee
      FROM
        dex_solana.trades AS trades
        JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
      WHERE
        TIME_RANGE
        AND trades.trader_id != '7LCZckF6XXGQ1hDY6HFXBKWAtiUgL9QY5vj1C4Bn1Qjj'
      GROUP BY trades.tx_id
    )
    SELECT
      SUM(fee) AS fee
    FROM
      botTrades
  `;

  const fees = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-04',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All trading fees paid by users while using Trojan bot.',
    Revenue: 'Fees collected by Trojan protocol.',
    ProtocolRevenue: "Fees collected by Trojan protocol.",
  }
};

export default adapter;
