import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]:
    sdk.graph.modifyEndpoint('6GjHurahqYLUUYkqfCgrWfcH2pfTEFPtPvCPvQ1BHLed'),
  [CHAIN.BSC]:
    sdk.graph.modifyEndpoint('4Zdyx9D4oYLGSm1C26jpTU7Ho7ecswEuTPg3WANGkMTx'),
};

const methodology = {
  Fees: "Fees from open/close position (0.1%), liquidations, swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees:
    "Fees from open/close position (0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "30% of all collected fees are distributed to MPX stakers",
  SupplySideRevenue: "60% of all collected fees are distributed to MLP stakers",
  Revenue:
    "Governance revenue is 30% of all collected fees, which are distributed to MPX stakers",
  ProtocolRevenue: "10% of all collected fees are distributed to the treasury",
};

const graphs = (chain: string) => async (timestamp: number) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  if (todaysTimestamp > 1737936000) return {};

  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

  const graphRes = await request(endpoints[chain], graphQuery);

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
    timestamp,
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.3).toString(),
    dailyProtocolRevenue: (finalDailyFee * 0.1).toString(),
    dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.6).toString(),
  };
};

const adapter: Adapter = {
  deadFrom: "2025-01-27",
  methodology,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: graphs(CHAIN.FANTOM),
      start: '2023-07-22',
    },
    [CHAIN.BSC]: {
      fetch: graphs(CHAIN.BSC),
      start: '2023-06-15',
    },
  },
};

export default adapter;
