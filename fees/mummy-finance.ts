import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('8LdLE9Aan39FQCcHX3x1HdnNzoZzPvxskhj1utLb2SA9'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('6dZD4zDx9bGZfRdgoUBsZjWBygYVXAe4G41LjTLNJWk1'),
};


const graphs = (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const searchTimestamp = todaysTimestamp;

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
      const userFee = parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap);
      const finalUserFee = userFee / 1e30;

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyUserFees: finalUserFee.toString(),
				dailyRevenue: (finalDailyFee * 0.4).toString(),
      };
    };
};

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.FANTOM]: 1670198400,
  [CHAIN.OPTIMISM]: 1677603600,
};
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: graphs(CHAIN.FANTOM),
      start: startTimestamps[CHAIN.FANTOM],
    },
    [CHAIN.OPTIMISM]: {
      fetch: graphs(CHAIN.OPTIMISM),
      start: startTimestamps[CHAIN.OPTIMISM],
    },
  },
};

export default adapter;
