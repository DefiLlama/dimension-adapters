import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGraph {
  dayId: number;
  date: string;
  pairId: string;
  totalVolumeUSD: string;
  volumeUSD: string;
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
  const response: IGraph[] = (await request(URL, query)).poolsDayData;
  const volume = response
    .filter((e: IGraph) => e.dayId === dayID)
    .filter((e: IGraph) => Number(e.volumeUSD) < 10_000_000)
    .reduce((acc: number, e: IGraph) => e.volumeUSD ? acc + Number(e.volumeUSD) : acc, 0);
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
          start: '2024-02-10',
        },
    },
};

export default adapter;
