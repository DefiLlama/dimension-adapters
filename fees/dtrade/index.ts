import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const DTRADE_FEE_WALLET = "0:93C1B918FA90EAC774C9BBEFF0E49742B4BFAC15D49E289A43351782C59A650C";
const TON_COINGECKO_ID = "the-open-network";
const DTRADE_EFFECTIVE_FEE_RATE = 0.01;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  //https://dune.com/queries/5351226
  const query = `
    SELECT
      COALESCE(SUM(CAST(value AS DOUBLE)) / 1e9, 0) AS fee_ton
    FROM ton.messages
    WHERE block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND direction = 'in'
      AND bounced = FALSE
      AND destination = '${DTRADE_FEE_WALLET}'
      AND LOWER(comment) LIKE '%dtrade%'
  `;

  const queryResult = await queryDuneSql(options, query);
  const feeTon = queryResult[0].fee_ton;
  // Mirrors the xRocket TON Trading Bots dashboard's DTrade methodology:
  // inferred volume = collected fees / 1% effective fee rate.
  const inferredVolumeTon = feeTon / DTRADE_EFFECTIVE_FEE_RATE;

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  dailyFees.addCGToken(TON_COINGECKO_ID, feeTon, METRIC.TRADING_FEES);
  dailyVolume.addCGToken(TON_COINGECKO_ID, inferredVolumeTon);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Volume: "Trading volume inferred from directly observed fees using the 1% effective fee heuristic used by the public TON Trading Bots Dune dashboard.",
  Fees: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos. Revenue is not reported because referral payouts are not reliably separable on-chain.",
  UserFees: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  start: "2024-10-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  skipBreakdownValidation: true,
};

export default adapter;
