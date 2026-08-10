import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { IValoremDayData } from "./interfaces";
import { getAllDailyRecords } from "./helpers";

const chainConfig: Record<string, { url: string, start: number }> = {
  [CHAIN.ARBITRUM]: {
    url: sdk.graph.modifyEndpoint('2cwenw6DXZBaSAQWvDVGqxrjbpnGR3JShhgySEvMJtBJ'),
    start: 1693526399,
  }
};

const fetch = async (options: FetchOptions) => {
  // get all daily records and filter out any that are after the timestamp
  const allDailyRecords = await getAllDailyRecords(
    { [options.chain]: chainConfig[options.chain].url },
    options.chain,
    options.toTimestamp
  );
  const filteredRecords = allDailyRecords
    .map((dayData) => {
      if (dayData.date <= options.startOfDay) {
        return dayData;
      }
    })
    .filter((x) => x !== undefined) as IValoremDayData[];

  const getTodaysStats = () => {
    let todayStats = filteredRecords.find(
      (dayData) => dayData.date === options.startOfDay
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
    dailyFees: todaysStats.dailyFees,
    dailyUserFees: todaysStats.dailyUserFees,
    dailyRevenue: todaysStats.dailyRevenue,
    dailyProtocolRevenue: todaysStats.dailyProtocolRevenue,
  };
};


export const methodology = {
  Fees: "All fees come from users of Valorem Protocol.",
  UserFees: "Valorem collects fees when users write and exercise options.",
  Revenue: "All revenue generated comes from user fees.",
  ProtocolRevenue:
    "Valorem collects fees when users write and exercise options.",
  HoldersRevenue: "Valorem has no governance token.",
  SupplySideRevenue: "Valorem has no LPs.",
};

const adapter: Adapter = {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: chainConfig[CHAIN.ARBITRUM].start,
};

export default adapter;
