import ADDRESSES from "../helpers/coreAssets.json";

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { evmReceivedGasAndTokens } from "../helpers/token";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH allFeePayments AS (
      SELECT
        tx_id,
        balance_change AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address = '9mAZ2HFYfUW9r1rYpM1cAsQTWS7SUp49AW1VzoLaPNgr' 
        AND tx_success
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
        AND trades.trader_id != '9mAZ2HFYfUW9r1rYpM1cAsQTWS7SUp49AW1VzoLaPNgr'
      GROUP BY trades.tx_id
    )
    SELECT
      SUM(fee) AS fee
    FROM
      botTrades
    `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const fetchEVM: any = async (_: any, _1: any, options: FetchOptions) => {
  const { dailyFees } = await evmReceivedGasAndTokens("0xCb077A7f06D54c582eD82f5C5ef9FeFB9B8Be449", [])(options);

  const USD1 = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d";
  const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

  const { dailyFees: usd1Fees, dailyRevenue: usd1Revenue } =
    await evmReceivedGasAndTokens(
      "0x7e618674021EF084cA2154069798Fe16727849cC",
      [USD1, WBNB]
    )(options);

  dailyFees.addBalances(usd1Fees);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-01-22",
    },
    [CHAIN.BSC]: {
      fetch: fetchEVM,
      start: "2025-03-30",
    },
  },
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees paid by users while using UnicornX app and website.",
    Revenue: "Trading fees are collected by UnicornX.",
    ProtocolRevenue: "Trading fees are collected by UnicornX.",
  },
};

export default adapter;
