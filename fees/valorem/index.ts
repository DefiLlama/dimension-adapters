import { Adapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import type { ChainEndpoints } from "../../adapters/types";
import {
  endpoints,
  OSE_DEPLOY_TIMESTAMP_BY_CHAIN,
  methodology,
} from "./constants";
import { IValoremDayData } from "./interfaces";
import { getAllDailyRecords } from "./helpers";

const graphOptions = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const formattedTimestamp = getUniqStartOfTodayTimestamp(
        new Date(timestamp * 1000)
      );

      // get all daily records and filter out any that are after the timestamp
      const allDailyRecords = await getAllDailyRecords(
        graphUrls,
        chain,
        timestamp
      );
      const filteredRecords = allDailyRecords
        .map((dayData) => {
          if (dayData.date <= formattedTimestamp) {
            return dayData;
          }
        })
        .filter((x) => x !== undefined) as IValoremDayData[];

      const getTodaysStats = () => {
        let todayStats = filteredRecords.find(
          (dayData) => dayData.date === formattedTimestamp
        );

        // return with values set to 0 if not found
        if (!todayStats) {
          throw new Error('Data missing')
        }

        return {
          dailyFees: todayStats.volFeesAccruedUSD,
          dailyUserFees: todayStats.volFeesAccruedUSD,
          dailyRevenue: todayStats.volFeesAccruedUSD,
          dailyProtocolRevenue: todayStats.volFeesAccruedUSD,
        };
      };

      const todaysStats = getTodaysStats();

      return {
        timestamp,
        dailyFees: todaysStats.dailyFees,
        dailyUserFees: todaysStats.dailyUserFees,
        dailyRevenue: todaysStats.dailyRevenue,
        dailyProtocolRevenue: todaysStats.dailyProtocolRevenue,
      };
    };
  };
};

const adapter: Adapter = {
  version: 1,
  methodology,
  adapter: {
    [ARBITRUM]: {
      fetch: graphOptions(endpoints)(ARBITRUM),
      start: OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ARBITRUM],
    },
  },
};

export default adapter;
