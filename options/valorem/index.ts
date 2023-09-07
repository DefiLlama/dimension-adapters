import { Adapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import type { ChainEndpoints } from "../../adapters/types";
import {
  endpoints,
  OSE_DEPLOY_TIMESTAMP_BY_CHAIN,
  methodology,
} from "../../fees/valorem/constants";
import { IValoremDayData } from "../../fees/valorem/interfaces";
import { getAllDailyRecords } from "../../fees/valorem/helpers";

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
          return {
            dailyNotionalVolume: undefined,
            dailyPremiumVolume: undefined,
          };
        }

        return {
          dailyNotionalVolume: todayStats.notionalVolCoreSumUSD,
          dailyPremiumVolume: undefined,
        };
      };

      const todaysStats = getTodaysStats();

      // add up totals from each individual preceding day
      const totalStatsUpToToday = filteredRecords.reduce(
        (acc, dayData) => {
          return {
            totalNotionalVolume:
              acc.totalNotionalVolume + Number(dayData.notionalVolCoreSumUSD),
            totalPremiumVolume:
              acc.totalPremiumVolume +
              Number(/** dayData.premiumVolCoreSumUSD */ "0"),
          };
        },
        {
          totalNotionalVolume: 0,
          totalPremiumVolume: 0,
        }
      );

      return {
        timestamp,
        dailyNotionalVolume: todaysStats.dailyNotionalVolume,
        dailyPremiumVolume: todaysStats.dailyPremiumVolume,
        totalNotionalVolume:
          totalStatsUpToToday.totalNotionalVolume > 0
            ? totalStatsUpToToday.totalNotionalVolume.toString()
            : undefined,
        totalPremiumVolume:
          totalStatsUpToToday.totalPremiumVolume > 0
            ? totalStatsUpToToday.totalPremiumVolume.toString()
            : undefined,
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: graphOptions(endpoints)(ARBITRUM),
      start: async () => OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ARBITRUM],
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
