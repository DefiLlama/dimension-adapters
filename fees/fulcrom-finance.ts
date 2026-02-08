import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { METRIC } from "../helpers/metrics";

const endpoints: Record<string, string> = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/fulcrom/stats-prod",
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/52869/stats-prod/version/latest",
  [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/fulcrom-stats-mainnet/prod/gn"
};

const ratios = {
  revenue: 0.4,
  protocol: 0.2,
  holders: 0.2,
  supplySideRevenue: 0.6
}

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const chain = options.chain;
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const searchTimestamp = "daily:" + todaysTimestamp;

  const graphQuery = gql`{
    feeStat(id: "${searchTimestamp}") {
      mint
      burn
      marginAndLiquidation
      swap
    }
  }`;

  const graphRes = await request(endpoints[chain], graphQuery);

  const dailyFees = options.createBalances()
  dailyFees.addUSDValue(graphRes.feeStat?.mint / 1e30, METRIC.MINT_REDEEM_FEES)
  dailyFees.addUSDValue(graphRes.feeStat?.burn / 1e30, METRIC.MINT_REDEEM_FEES)
  dailyFees.addUSDValue(graphRes.feeStat?.marginAndLiquidation / 1e30, METRIC.LIQUIDATION_FEES)
  dailyFees.addUSDValue(graphRes.feeStat?.swap / 1e30, METRIC.SWAP_FEES)

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(ratios.revenue),
    dailyProtocolRevenue: dailyFees.clone(ratios.protocol),
    dailyHoldersRevenue: dailyFees.clone(ratios.holders),
    dailySupplySideRevenue: dailyFees.clone(ratios.supplySideRevenue),
  };
};

const methodology = {
  Fees: "Fees from swaps (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and liquidation fees",
  UserFees: "All fees are paid by users",
  HoldersRevenue: "20% of all collected fees goes to FUL stakers",
  SupplySideRevenue: "60% of all collected fees goes to FLP holders",
  Revenue: "Revenue is 40% of all collected fees, which goes to FUL stakers and treasury",
  ProtocolRevenue: "Treasury has 20% revenue",
};

const adapter: Adapter = {
  version: 1,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "Mint and Burn fees based on tokens balance in the pool",
      [METRIC.SWAP_FEES]: "Swap fees that go from 0.2% to 0.8%",
      [METRIC.LIQUIDATION_FEES]: "5 USD for full liquidation only"
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: "40% of the mint and burn fees goes to the protocol",
      [METRIC.SWAP_FEES]: "40% of the swap fees goes to the protocol",
      [METRIC.LIQUIDATION_FEES]: "40% of the liquidation fees goes to the protocol"
    },
    HoldersRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "20% of the mint and burn fees goes to FUL stakers",
      [METRIC.SWAP_FEES]: "20% of the swap fees goes to FUL stakers",
      [METRIC.LIQUIDATION_FEES]: "20% of the liquidation fees goes to FUL stakers"
    },
    ProtocolRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "20% of the mint and burn fees goes to treasury",
      [METRIC.SWAP_FEES]: "20% of the swap fees goes to treasury",
      [METRIC.LIQUIDATION_FEES]: "20% of the liquidation fees goes to treasury"
    },
    SupplySideRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "60% of the mint and burn fees goes to FLP holders",
      [METRIC.SWAP_FEES]: "60% of the swap fees goes to FLP holders",
      [METRIC.LIQUIDATION_FEES]: "60% of the liquidation fees goes to FLP holders"
    }
  },
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      start: '2023-02-27',
    },
    [CHAIN.ERA]: {
      fetch,
      start: '2023-10-05',
    },
    [CHAIN.CRONOS_ZKEVM]: {
      fetch,
      start: '2024-08-15',
    },
  },
};

export default adapter;
