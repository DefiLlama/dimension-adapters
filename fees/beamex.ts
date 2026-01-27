import { gql, request } from "graphql-request";
import { Adapter, ChainEndpoints, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpointsBeamex: ChainEndpoints = {
  [CHAIN.MOONBEAM]:
    'https://graph.beamswap.io/subgraphs/name/beamswap/beamex-stats',
};

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const chain = options.chain;
  const searchTimestamp = getTimestampAtStartOfDayUTC(timestamp);

  const graphQuery = gql`{
    feeStat(id: "${searchTimestamp}") {
      mint
      burn
      marginAndLiquidation
      swap
    }
  }`;

  const graphRes = await request(endpointsBeamex[chain], graphQuery);

  const dailyFee =
    parseInt(graphRes.feeStat.mint) +
    parseInt(graphRes.feeStat.burn) +
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalDailyFee = dailyFee / 1e30;
  const userFee =
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalUserFee = userFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.2).toString(),
    dailyProtocolRevenue: (finalDailyFee * 0.2).toString(),
    dailyHoldersRevenue: (finalDailyFee * 0.2).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.6).toString(),
  };
};

const adapter: Adapter = {
  methodology: {
    Fees: "Fees from open/close position (0.1%), liquidations, swap (0.1% to 0.4%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.02%)",
    UserFees:
      "Fees from open/close position (0.1%), swap (0.1% to 0.4%) and borrow fee ((assets borrowed)/(total assets in pool)*0.04%)",
    HoldersRevenue:
      "20% of all collected fees are distributed to $stGLINT stakers",
    SupplySideRevenue:
      "60% of all collected fees are distributed to BLP stakers. Currently they are distributed to treasury",
    Revenue: "20% of all collected fees are distributed to the treasury and upkeep",
    ProtocolRevenue: "20% of all collected fees are distributed to the treasury and upkeep",
  },
  version: 1,
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch,
      start: '2023-06-22',
    },
  },
};

export default adapter;
