import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

// Trojan Fee Wallet: 9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: [
    '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco', 
    '92Med3qeK7duC5iiYsHX38H2f2twJfRsSx93oNrza2VH',
    '2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ', 
    '65gDv7pZQCZELsNpNYSFEBtNFpWZAbxmRFB6BGMqFkHH', 
    'BWgb8wR1FEGiu1jCDSKuHKf752W27b4iN6SvoNCiK4qp', 
    '8jgg7moFJkHyTtAv9M6RBSPMp2oXeXhuiUMKW8YbYCWn'
  ]})

  // const query = `
  //   WITH
  //   allFeePayments AS (
  //     SELECT
  //       tx_id,
  //       balance_change AS fee_token_amount
  //     FROM
  //       solana.account_activity
  //     WHERE
  //       TIME_RANGE
  //       AND tx_success
  //       AND address = '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco'
  //       AND balance_change > 0 
  //   ),
  //   botTrades AS (
  //     SELECT
  //       trades.tx_id,
  //       MAX(fee_token_amount) AS fee
  //     FROM
  //       dex_solana.trades AS trades
  //       JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
  //     WHERE
  //       TIME_RANGE
  //       AND trades.trader_id != '7LCZckF6XXGQ1hDY6HFXBKWAtiUgL9QY5vj1C4Bn1Qjj'
  //     GROUP BY trades.tx_id
  //   )
  //   SELECT
  //     SUM(fee) AS fee
  //   FROM
  //     botTrades
  // `;

  // const fees = await queryDuneSql(options, query);
  // const dailyFees = options.createBalances();
  // dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-04',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All trading fees paid by users while using Trojan bot and Trojan Terminal.',
    Revenue: 'Fees collected by Trojan protocol.',
    ProtocolRevenue: "Fees collected by Trojan protocol.",
  }
};

export default adapter;
