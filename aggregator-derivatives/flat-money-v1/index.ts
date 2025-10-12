import { SimpleAdapter, FetchV2, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  calculateAdjustsVolume, calculateClosesVolume,
  calculateOpensVolume, CONFIG,
  fetchVolume,
  leverageAdjustsQuery,
  leverageClosesQuery,
  leverageOpensQuery
} from "../flat-money/helper";




const fetch: FetchV2 = async ({ startTimestamp, endTimestamp, chain }): Promise<FetchResultV2> => {
  const config = CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const { decimals, } = config;

  const [
    dailyOpensData,
    dailyAdjustsData,
    dailyClosesData,
  ] = await Promise.all([
    fetchVolume(chain as CHAIN, leverageOpensQuery, "leverageOpens", startTimestamp, endTimestamp),
    fetchVolume(chain as CHAIN, leverageAdjustsQuery, "leverageAdjusts", startTimestamp, endTimestamp),
    fetchVolume(chain as CHAIN, leverageClosesQuery, "leverageCloses", startTimestamp, endTimestamp),
  ]);

  return {
    dailyVolume: calculateOpensVolume(dailyOpensData, decimals.amount)
        + calculateAdjustsVolume(dailyAdjustsData, decimals.amount)
        + calculateClosesVolume(dailyClosesData, decimals.amount),
  };
};



const adapter: SimpleAdapter = {
  adapter: Object.fromEntries(
    Object.entries(CONFIG).filter(([chain, config]) => chain === CHAIN.BASE).map(([chain, config]) => [
      chain,
      { fetch, start: config.startTimestamp }
    ])
  ),
  version: 2
};


export default adapter;
