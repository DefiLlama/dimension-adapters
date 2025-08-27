import { Adapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import type { ChainEndpoints, } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import {
  endpoints,
  OSE_DEPLOY_TIMESTAMP_BY_CHAIN,
  methodology,
} from "../../fees/valorem/constants";
import {
  IValoremTokenDayData,
} from "../../fees/valorem/interfaces";
import {
  DailyTokenRecords,
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
      
      return {
        timestamp,
        dailyNotionalVolume: todaysStats.dailyNotionalVolume,
        dailyPremiumVolume: todaysStats.dailyPremiumVolume,
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
