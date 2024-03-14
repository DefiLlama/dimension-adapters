import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://stats.mux.network/api/public/dashboard/13f401da-31b4-4d35-8529-bb62ca408de8/dashcard/389/card/306"

interface IVolumeall {
  volume: string;
  time: string;
  title: string;
}

type chains = {
  [chain: string | Chain]: string;
}

const chainsMap: chains = {
    [CHAIN.ARBITRUM]: "Arbitrum",
    [CHAIN.AVAX]: "Avalanche",
    [CHAIN.BSC]: "BNB Chain",
    [CHAIN.FANTOM]: "Fantom"
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint))?.data.rows;

    const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
      const [time, title, volume] = e;
      return {
        time,
        volume,
        title
      } as IVolumeall;
    });

    const historical = historicalVolume.filter((e: IVolumeall)  => e.title === chainsMap[chain]);
    const totalVolume = historical
      .filter(volItem => getUniqStartOfTodayTimestamp(new Date(volItem.time)) <= dayTimestamp)
      .reduce((acc, { volume }) => acc + Number(volume), 0)

    const dailyVolume = historical
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.time)) === dayTimestamp)?.volume

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  }
};

const getStartTimestamp = async (chain: Chain) => {
  const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint))?.data.rows;
  const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
    const [time, title, volume] = e;
    return {
      time,
      volume,
      title
    } as IVolumeall;
  });

  const historicalCall = historicalVolume.filter((e: IVolumeall)  => e.title === chainsMap[chain]);
  const historical = historicalCall.sort((a: IVolumeall,b: IVolumeall)=> new Date(a.time).getTime() - new Date(b.time).getTime());
  return (new Date(historical[0].time).getTime()) / 1000
}

const adapteragges: any = {
  "mux-protocol-agge": Object.keys(chainsMap).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain as Chain),
        start: 1708387200,
      }
    }
  }, {})
};

export {
  adapteragges
}
