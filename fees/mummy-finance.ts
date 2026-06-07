import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('8LdLE9Aan39FQCcHX3x1HdnNzoZzPvxskhj1utLb2SA9'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('6dZD4zDx9bGZfRdgoUBsZjWBygYVXAe4G41LjTLNJWk1'),
};


const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);
  const searchTimestamp = todaysTimestamp;

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
  const userFee = parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap);
  const finalUserFee = userFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.4).toString(),
  };
};

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.FANTOM]: 1670198400,
  [CHAIN.OPTIMISM]: 1677603600,
};

const adapter: SimpleAdapter = {
  fetch,
  adapter: {
    [CHAIN.FANTOM]: {
      start: startTimestamps[CHAIN.FANTOM],
    },
    [CHAIN.OPTIMISM]: {
      start: startTimestamps[CHAIN.OPTIMISM],
    },
  },
  deadFrom: "2025-06-20",
};

export default adapter;
