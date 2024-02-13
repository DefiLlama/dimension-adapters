import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
  [s: string]: string;
}

const url: IUrl = {
  [CHAIN.APTOS]: "https://api.cetus.zone/v1/histogram?date_type=day&typ=vol",
  [CHAIN.SUI]: "https://api-sui.cetus.zone/v2/sui/histogram?date_type=day&typ=vol"
}

interface IVolumeall {
  num: string;
  date: string;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historicalVolume: IVolumeall[] = (await fetchURL(url[chain])).data.list;
    const totalVolume = historicalVolume
      .filter(volItem => (new Date(volItem.date.split('T')[0]).getTime() / 1000) <= dayTimestamp)
      .reduce((acc, { num }) => acc + Number(num), 0)

    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === dayTimestamp)?.num

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
}



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch(CHAIN.APTOS),
      start: 1666224000,
    },
    [CHAIN.SUI]: {
      fetch: fetch(CHAIN.SUI),
      start: 1682985600,
    }
  },
};

export default adapter;
