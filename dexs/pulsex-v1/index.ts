import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";

interface IGraph {
  dailyVolumeUSD: string;
}

interface IData {
  pairDayDatas: IGraph[];

}

type TEndpoint = {
  [s: string | Chain]: string;
};

const endpoints: TEndpoint = {
  [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex",
};

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const pairs: string[] = [
        "0xe56043671df55de5cdf8459710433c10324de0ae",
        "0x6753560538eca67617a9ce605178f788be7e524e",
        "0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9",
        "0x322df7921f28f1146cdf62afdac0d6bc0ab80711",
        "0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65",
    ]
    const query = `
      {
        pairDayDatas(orderBy:dailyVolumeUSD orderDirection:desc where:{ date: ${dayTimestamp}, pairAddress_in: ["${pairs.map(c => c.toLowerCase()).join('","')}"]}){
          id
          date
          dailyVolumeUSD
        }
      }`;

    const response: IData = (await request(endpoints[chain], query));
    const dailyVolume = response.pairDayDatas
      .filter((e: IGraph) => Number(e.dailyVolumeUSD) < 100_000_000)
      .reduce((a: number, b: IGraph) => a+Number(b.dailyVolumeUSD), 0)
    return {
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.PULSECHAIN]: {
      fetch: fetchVolume(CHAIN.PULSECHAIN),
      start: 1684540800,
    },
  },
};

export default adapter;
