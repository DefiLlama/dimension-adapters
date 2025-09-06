import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { request, gql } from "graphql-request";
import { FetchV2 } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: any = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-arbitrum-stats/api",
  [CHAIN.AVAX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-avalanche-stats/api"
}

const methodology = {
  Fees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "30% of all collected fees goes to GMX stakers",
  SupplySideRevenue: "70% of all collected fees goes to GLP holders",
  Revenue: "Revenue is 30% of all collected fees, which goes to GMX stakers",
  ProtocolRevenue: "Treasury has no revenue"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: "Fees from mint and burn (based on tokens balance in the pool)",
    [METRIC.MARGIN_FEES]: "Fees from open/close position (0.1%), and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
    [METRIC.SWAP_FEES]: "Fees from tokens swap (0.2% to 0.8%)",
  },
  UserFees: {
    [METRIC.MARGIN_FEES]: "Fees from open/close position (0.1%), and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
    [METRIC.SWAP_FEES]: "Fees from tokens swap (0.2% to 0.8%)",
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: "30% of mint/redeem fees",
    [METRIC.MARGIN_FEES]: "30% of margin fees",
    [METRIC.SWAP_FEES]: "30% of tokens swap fees",
  },
  SupplySideRevenue: {
    [METRIC.MINT_REDEEM_FEES]: "70% of revenue from mint/redeem fees to GLP",
    [METRIC.MARGIN_FEES]: "70% of revenue from margin fees to GLP",
    [METRIC.SWAP_FEES]: "70% of revenue from tokens swap fees to GLP",
  },
  HoldersRevenue: {
    [METRIC.MINT_REDEEM_FEES]: "30% of revenue from mint/redeem fees to GMX stakers",
    [METRIC.MARGIN_FEES]: "30% of revenue from margin fees to GMX stakers",
    [METRIC.SWAP_FEES]: "30% of revenue from tokens swap fees to GMX stakers",
  },
  ProtocolRevenue: "Treasury has no revenue"
}

const graphs: FetchV2 = async ({ chain, endTimestamp, createBalances }) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
  const searchTimestamp = chain == "arbitrum" ? todaysTimestamp : todaysTimestamp + ":daily"

  const graphQuery = gql
    `{
      feeStat(id: "${searchTimestamp}") {
        mint
        burn
        marginAndLiquidation
        swap
      }
    }`;

  const graphRes = await request(endpoints[chain], graphQuery);

  const dailyFees = createBalances()
  const dailyUserFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()

  dailyFees.addUSDValue((parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn)) / 1e30, METRIC.MINT_REDEEM_FEES)
  dailyFees.addUSDValue(parseInt(graphRes.feeStat.marginAndLiquidation) / 1e30, METRIC.MARGIN_FEES)
  dailyFees.addUSDValue(parseInt(graphRes.feeStat.swap) / 1e30, METRIC.SWAP_FEES)

  dailyUserFees.addUSDValue(parseInt(graphRes.feeStat.marginAndLiquidation) / 1e30, METRIC.MARGIN_FEES)
  dailyUserFees.addUSDValue(parseInt(graphRes.feeStat.swap) / 1e30, METRIC.SWAP_FEES)

  dailyRevenue.addUSDValue((parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn)) / 1e30 * 0.3, METRIC.MINT_REDEEM_FEES)
  dailyRevenue.addUSDValue(parseInt(graphRes.feeStat.marginAndLiquidation) / 1e30 * 0.3, METRIC.MARGIN_FEES)
  dailyRevenue.addUSDValue(parseInt(graphRes.feeStat.swap) / 1e30 * 0.3, METRIC.SWAP_FEES)

  dailySupplySideRevenue.addUSDValue((parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn)) / 1e30 * 0.3 * 0.7, METRIC.MINT_REDEEM_FEES)
  dailySupplySideRevenue.addUSDValue(parseInt(graphRes.feeStat.marginAndLiquidation) / 1e30 * 0.3 * 0.7, METRIC.MARGIN_FEES)
  dailySupplySideRevenue.addUSDValue(parseInt(graphRes.feeStat.swap) / 1e30 * 0.3 * 0.7, METRIC.SWAP_FEES)

  dailyHoldersRevenue.addUSDValue((parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn)) / 1e30 * 0.3 * 0.3, METRIC.MINT_REDEEM_FEES)
  dailyHoldersRevenue.addUSDValue(parseInt(graphRes.feeStat.marginAndLiquidation) / 1e30 * 0.3 * 0.3, METRIC.MARGIN_FEES)
  dailyHoldersRevenue.addUSDValue(parseInt(graphRes.feeStat.swap) / 1e30 * 0.3 * 0.3, METRIC.SWAP_FEES)

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
  };
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs,
      start: '2021-09-01',
    },
    [CHAIN.AVAX]: {
      fetch: graphs,
      start: '2022-01-06',
    },
  }
}

export default adapter;
