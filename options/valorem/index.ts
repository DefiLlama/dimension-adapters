import { Adapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import type { ChainEndpoints, FetchResultOptions } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import {
  endpoints,
  OSE_DEPLOY_TIMESTAMP_BY_CHAIN,
  methodology,
} from "../../fees/valorem/constants";
import {
  IValoremDayData,
  IValoremTokenDayData,
} from "../../fees/valorem/interfaces";
import {
  DailyTokenRecords,
  getAllDailyRecords,
  getAllDailyTokenRecords,
} from "../../fees/valorem/helpers";

const graphOptions = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number): Promise<any /* FetchResultOptions */> => {
      const formattedTimestamp = getUniqStartOfTodayTimestamp(
        new Date(timestamp * 1000)
      );

      /** Daily Token Metrics */

      const allDailyTokenRecords = await getAllDailyTokenRecords(
        graphUrls,
        chain,
        timestamp
      );

      let filteredTokenRecords: DailyTokenRecords = {};

      Object.keys(allDailyTokenRecords).forEach((tokenDayDataKey) => {
        const filteredTokenDayDatas = allDailyTokenRecords[tokenDayDataKey]
          .map((tokenDayData) => {
            if (tokenDayData.date <= formattedTimestamp) {
              return tokenDayData;
            }
          })
          .filter((x) => x !== undefined);
        filteredTokenRecords[tokenDayDataKey] =
          filteredTokenDayDatas as IValoremTokenDayData[];
      });

      const getTodaysStats = async () => {
        let todayStats = {
          dailyNotionalVolume: {} as Record<string, string | undefined>,
          dailyPremiumVolume: undefined,
        };

        Object.keys(filteredTokenRecords).forEach((key) => {
          const todaysDataForToken = filteredTokenRecords[key].find(
            (dayData) => dayData.date === formattedTimestamp
          );
          todayStats.dailyNotionalVolume[key] =
            todaysDataForToken?.notionalVolCoreSum ?? '0';
        });

        todayStats.dailyNotionalVolume = await sdk.Balances.getUSDString(todayStats.dailyNotionalVolume as any) as any

        return todayStats;
      };

      const todaysStats = await getTodaysStats();

      /** Backfilled USD Metrics */
      // add up totals from each individual preceding day
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
      // add up totals from each individual preceding day
      const totalStatsUpToToday = filteredRecords.reduce(
        (acc, dayData) => {
          return {
            totalNotionalVolume: (
              Number(acc.totalNotionalVolume) +
              Number(dayData.notionalVolCoreSumUSD)
            ).toString(),
            totalPremiumVolume: undefined,
          };
        },
        {
          totalNotionalVolume: "0",
          totalPremiumVolume: undefined,
        }
      );
      
      return {
        timestamp,
        dailyNotionalVolume: todaysStats.dailyNotionalVolume,
        dailyPremiumVolume: todaysStats.dailyPremiumVolume,
        totalNotionalVolume: totalStatsUpToToday.totalNotionalVolume,
        totalPremiumVolume: totalStatsUpToToday.totalPremiumVolume,
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: graphOptions(endpoints)(ARBITRUM),
      start: OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ARBITRUM],
    },
  },
  methodology,
};

export default adapter;
