import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { IValoremTokenDayData } from "../../fees/valorem/interfaces";
import { DailyTokenRecords, getAllDailyTokenRecords } from "../../fees/valorem/helpers";


const chainConfig: Record<string, { url: string, start: number }> = {
  [CHAIN.ARBITRUM]: {
    url: sdk.graph.modifyEndpoint('2cwenw6DXZBaSAQWvDVGqxrjbpnGR3JShhgySEvMJtBJ'),
    start: 1693526399,
  }
};

const fetch = async (options: FetchOptions): Promise<any /* FetchResultOptions */> => {
  /** Daily Token Metrics */

  const allDailyTokenRecords = await getAllDailyTokenRecords(
    { [options.chain]: chainConfig[options.chain].url },
    options.chain,
    options.toTimestamp
  );

  let filteredTokenRecords: DailyTokenRecords = {};

  Object.keys(allDailyTokenRecords).forEach((tokenDayDataKey) => {
    const filteredTokenDayDatas = allDailyTokenRecords[tokenDayDataKey]
      .map((tokenDayData) => {
        if (tokenDayData.date <= options.startOfDay) {
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
        (dayData) => dayData.date === options.startOfDay
      );
      todayStats.dailyNotionalVolume[key] =
        todaysDataForToken?.notionalVolCoreSum ?? '0';
    });

    todayStats.dailyNotionalVolume = await sdk.Balances.getUSDString(todayStats.dailyNotionalVolume as any) as any

    return todayStats;
  };

  const todaysStats = await getTodaysStats();

  return {
    dailyNotionalVolume: todaysStats.dailyNotionalVolume,
    dailyPremiumVolume: todaysStats.dailyPremiumVolume,
  };
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: chainConfig[CHAIN.ARBITRUM].start,
  methodology: {
    NotionalVolume: "Notional Volume is calculated with the market value of the Underlying + Exercise assets of a position at the time of Write/Exercise/Redeem/Transfer.",
    PremiumVolume: "Premium Volume is calculated with the market price an Option/Claim position is trading for on the Exchange.",
  },
};

export default adapter;
