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
const URL = 'https://api.jediswap.xyz/graphql';
const blackList: string[] = [
  "0x7c97816efc03e21264ce90006777c3680df15c24f034809dcfc75c15147eccb",
  "0x3d56e63387bc55426941a47d6e8b7571d3b98c72253275d8c449a5f216e75a5"
]

const fetch = async (timestamp: number, _: ChainBlocks, {  createBalances }: FetchOptions): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dayID = (dayTimestamp / 86400);
    const query = gql`
    {
      pairDayDatas(first: 1000 where:{dateGt:1669593600}, orderBy:"date", orderByDirection:"dese") {
        dayId
        pairId
        totalSupply
        dailyVolumeUSD
        reserveUSD
      }
    }
    `
    const response: IGraph[] = (await request(URL, query)).pairDayDatas;
    const volume = response.filter(e =>Number(e.reserveUSD) > 10000)
      .filter((e: IGraph) => e.dayId === dayID)
      .sort((a: IGraph, b: IGraph) => Number(b.dailyVolumeUSD) - Number(a.dailyVolumeUSD))
      .filter((e: IGraph) => !blackList.includes(e.pairId))
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
          start: '2022-11-28',
        },
    },
};

export default adapter;
