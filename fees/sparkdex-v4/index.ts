import { gql, request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { BBB_START } from "../../helpers/sparkdex";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v4/latest/gn",
};

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.startTimestamp);
  const dateId = Math.floor(todaysTimestamp / 86400);

  const graphQuery = gql`
    query {
      algebraDayData(id: ${dateId}) {
        id
        feesUSD
      }
    }
  `;

  const graphRes = await request(endpoints[options.chain], graphQuery);
  const feesUsd = Number(graphRes.algebraDayData?.feesUSD ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesUsd, METRIC.SWAP_FEES);

  const dailyUserFees = dailyFees.clone(1, METRIC.SWAP_FEES);
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  let dailySupplySideRevenue;

  if (todaysTimestamp >= BBB_START) {
    // 75% LP / 25% treasury BBB / 0% protocol
    dailySupplySideRevenue = dailyFees.clone(0.75, METRIC.LP_FEES);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.25, METRIC.TOKEN_BUY_BACK);
  } else {
    // Historical: 75% LP / 5% Foundation / 10% BBB / 10% staking
    dailySupplySideRevenue = dailyFees.clone(0.75, METRIC.LP_FEES);
    dailyProtocolRevenue.addUSDValue(feesUsd * 0.05, METRIC.SWAP_FEES);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.1, METRIC.TOKEN_BUY_BACK);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.1, METRIC.STAKING_REWARDS);
  }

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.FLARE],
  start: "2026-01-26",
  // algebraDayData only exposes daily aggregates; hourly pull is unsupported
  pullHourly: false,
  methodology: {
    Fees: "Swap fees paid by platform users on SparkDEX V4.",
    UserFees: "100% of collected fees.",
    Revenue: "25% of swap fees.",
    ProtocolRevenue: "Before 2026-05-18: 5% of swap fees. From 2026-05-18: 0%.",
    SupplySideRevenue: "75% of swap fees.",
    HoldersRevenue:
      "Before 2026-05-18: 10% buyback-and-burn + 10% staking rewards. From 2026-05-18: 25% buyback-and-burn.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "All swap fees paid by platform users.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "100% of collected fees.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "5% of swap fees (before 2026-05-18 only).",
      [METRIC.TOKEN_BUY_BACK]: "10% of swap fees before 2026-05-18, 25% from 2026-05-18.",
      [METRIC.STAKING_REWARDS]: "10% of swap fees (before 2026-05-18 only).",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "10% of swap fees before 2026-05-18, 25% from 2026-05-18.",
      [METRIC.STAKING_REWARDS]: "10% of swap fees (before 2026-05-18 only).",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "75% of swap fees.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "5% of swap fees (before 2026-05-18 only).",
    },
  },
};

export default adapter;
