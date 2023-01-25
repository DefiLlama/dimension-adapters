import { Adapter, BreakdownAdapter } from "../../adapters/types";
import { ETHEREUM, ARBITRUM } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import type { ChainEndpoints } from "../../adapters/types";
import {
  endpoints,
  OSE_DEPLOY_TIMESTAMP_BY_CHAIN,
  methodology,
} from "./constants";
import { IValoremDayData } from "./interfaces";
import { getAllDailyRecords } from "./helpers";

const graphExchange = (_graphUrls: ChainEndpoints) => {
  return (_chain: Chain) => {
    return async (timestamp: number) => {
      return {
        timestamp,
        dailyFees: undefined,
        dailyUserFees: undefined,
        dailyRevenue: undefined,
        dailyProtocolRevenue: undefined,
        totalFees: undefined,
        totalUserFees: undefined,
        totalRevenue: undefined,
        totalProtocolRevenue: undefined,
      };
    };
  };
};

const graphOptions = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const formattedTimestamp = getUniqStartOfTodayTimestamp(
        new Date(timestamp * 1000)
      );

      // get all daily records and filter out any that are after the timestamp
      const allDailyRecords = await getAllDailyRecords(graphUrls, chain);
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
            dailyFees: undefined,
            dailyUserFees: undefined,
            dailyRevenue: undefined,
            dailyProtocolRevenue: undefined,
          };
        }

        return {
          dailyFees: todayStats.notionalVolFeesAccruedUSD,
          dailyUserFees: todayStats.notionalVolFeesAccruedUSD,
          dailyRevenue: todayStats.notionalVolFeesAccruedUSD,
          dailyProtocolRevenue: todayStats.notionalVolFeesAccruedUSD,
        };
      };

      const todaysStats = getTodaysStats();

      // add up totals from each individual preceding day
      const totalStatsUpToToday = filteredRecords.reduce(
        (acc, dayData) => {
          return {
            totalFees:
              acc.totalFees + Number(dayData.notionalVolFeesAccruedUSD),
            totalUserFees:
              acc.totalUserFees + Number(dayData.notionalVolFeesAccruedUSD),
            totalRevenue:
              acc.totalRevenue + Number(dayData.notionalVolFeesAccruedUSD),
            totalProtocolRevenue:
              acc.totalProtocolRevenue +
              Number(dayData.notionalVolFeesAccruedUSD),
          };
        },
        {
          totalFees: 0,
          totalUserFees: 0,
          totalRevenue: 0,
          totalProtocolRevenue: 0,
        }
      );

      return {
        timestamp,
        dailyFees: todaysStats.dailyFees,
        dailyUserFees: todaysStats.dailyUserFees,
        dailyRevenue: todaysStats.dailyRevenue,
        dailyProtocolRevenue: todaysStats.dailyProtocolRevenue,
        totalFees:
          totalStatsUpToToday.totalFees > 0
            ? totalStatsUpToToday.totalFees.toString()
            : undefined,
        totalUserFees:
          totalStatsUpToToday.totalUserFees > 0
            ? totalStatsUpToToday.totalUserFees.toString()
            : undefined,
        totalRevenue:
          totalStatsUpToToday.totalRevenue > 0
            ? totalStatsUpToToday.totalRevenue.toString()
            : undefined,
        totalProtocolRevenue:
          totalStatsUpToToday.totalProtocolRevenue > 0
            ? totalStatsUpToToday.totalProtocolRevenue.toString()
            : undefined,
      };
    };
  };
};

// simple adapter, no segmenting OSE/Quay Exchange
// const adapter: Adapter = {
//   adapter: {
//     /** GOERLI */ [ETHEREUM]: {
//       fetch: graphOptions(endpoints)(ETHEREUM),
//       start: async () => OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ETHEREUM],
//       meta: {
//         methodology,
//       },
//     },
//     [ARBITRUM]: {
//       fetch: graphOptions(endpoints)(ARBITRUM),
//       start: async () => OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ARBITRUM],
//       meta: {
//         methodology,
//       },
//     },
//   },
// };

// breakdown adapter, provides views for different segments
const adapter: BreakdownAdapter = {
  breakdown: {
    ["Options"]: {
      /** GOERLI */ [ETHEREUM]: {
        fetch: graphOptions(endpoints)(ETHEREUM),
        start: async () => OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ETHEREUM],
        meta: {
          methodology,
        },
      },
      [ARBITRUM]: {
        fetch: graphOptions(endpoints)(ARBITRUM),
        start: async () => OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ARBITRUM],
        meta: {
          methodology,
        },
      },
    },
    ["Exchange"]: {
      /** GOERLI */ [ETHEREUM]: {
        fetch: graphExchange(endpoints)(ETHEREUM),
        start: async () => OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ETHEREUM],
        meta: {
          methodology,
        },
      },
      [ARBITRUM]: {
        fetch: graphExchange(endpoints)(ARBITRUM),
        start: async () => OSE_DEPLOY_TIMESTAMP_BY_CHAIN[ARBITRUM],
        meta: {
          methodology,
        },
      },
    },
  },
};

export default adapter;
