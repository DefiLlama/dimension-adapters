import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGraph {
  dayId: number;
  date: string;
  pairId: string;
  totalVolumeUSD: string;
  dailyVolumeUSD: string;
  reserveUSD: string;
}

const URL = 'https://api.v2.jediswap.xyz/graphql';

const fetch = async (timestamp: number, _: ChainBlocks, {  createBalances }: FetchOptions): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dayID = Math.floor(dayTimestamp / 86400);
  const query = gql`
  {
    poolsDayData(first:1000, orderBy:"dayId", orderByDirection:"desc") {
      dayId
      volumeUSD
      datetime
    }
  }
  `
  const response: IGraph[] = (await request(URL, query)).pairDayDatas;
  const volume = response.filter(e =>Number(e.reserveUSD) > 10000)
    .filter((e: IGraph) => e.dayId === dayID)
    .sort((a: IGraph, b: IGraph) => Number(b.dailyVolumeUSD) - Number(a.dailyVolumeUSD))
    .filter((e: IGraph) => Number(e.dailyVolumeUSD) < 10_000_000)
    .reduce((acc: number, e: IGraph) => e.dailyVolumeUSD ? acc + Number(e.dailyVolumeUSD) : acc, 0);
  const dailyVolume = createBalances();
  dailyVolume.addCGToken('tether', volume);
  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.STARKNET]: {
          fetch: fetch,
          start: 1707523200,
        },
    },
};

export default adapter;
