// https://www.ponytaswap.finance/v1/info/overview
import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://www.ponytaswap.finance/v1/info/overview"

interface IVolumeall {
  volumeUSD: number;
  date: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data;

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.date * 1000)) === options.startOfDay)?.volumeUSD

  return {
    dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.RPG],
  start: '2023-03-06',
  // www.ponytaswap.finance and the ponytaswap.finance apex are both NXDOMAIN, so the only source
  // this adapter has cannot answer. Last published point 2025-06-04, last non-zero 2024-12-27,
  // and its TVL has read 0 since 2026-01-26.
  deadFrom: '2025-06-05',
};

export default adapter;
