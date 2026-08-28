import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

interface IGraph {
  dayId: number;
  date: string;
  pairId: string;
  totalVolumeUSD: string;
  volumeUSD: string;
  reserveUSD: string;
}

const URL = 'https://api.v2.jediswap.xyz/graphql';

const fetch = async ({ createBalances, startOfDay }: FetchOptions): Promise<FetchResult> => {
  const dayID = Math.floor(startOfDay / 86400);
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
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STARKNET],
  start: '2024-02-10',
};

export default adapter;
