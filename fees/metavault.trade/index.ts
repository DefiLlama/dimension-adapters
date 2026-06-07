import * as sdk from "@defillama/sdk";
import { gql, request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('BMn9XsegbLxw9TL6uyw5NntoiGRyMqRpF2vShkKzusJ3'),
};

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);
  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyFee =
    parseInt(graphRes.feeStat.mint) +
    parseInt(graphRes.feeStat.burn) +
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalDailyFee = dailyFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyRevenue: (finalDailyFee * 0.3).toString(),
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  start: '2022-06-01',
  chains: [CHAIN.POLYGON],
  methodology: {
    Fees: 'All mint, burn, marginAndLiquidation and swap fees are collected and the daily fee amount is determined.',
    Revenue: 'Daily revenue is calculated as 30% of the total fee.',
  },
  deadFrom: "2025-06-04",
};

export default adapter;
