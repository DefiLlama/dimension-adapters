// import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
// import { CHAIN } from "../../helpers/chains";

// const endpoints = {
//   [CHAIN.MANTLE]: "https://graph.fusionx.finance/subgraphs/name/fusionx/exchange-v3",
// };

// const adapter = univ2Adapter(endpoints, {
//   factoriesName: "factories",
//   dayData: "fusionXDayData",
//   dailyVolume: "volumeUSD",
// });

// adapter.adapter.mantle.start = async () => 1689206400;

// export default adapter


import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../../helpers/getBlock";

interface IGraph {
  dailyTradeVolumeUSD: string;
  dayID: string;
}

interface IProtocol {
  totalTradeVolumeUSD: string;
}
interface IData {
  volumeUSD: IGraph;
}

type TEndpoint = {
  [s: string | Chain]: string;
};

const endpoints: TEndpoint = {
  [CHAIN.MANTLE]:"https://graph.fusionx.finance/subgraphs/name/fusionx/exchange-v3",
};

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const fromTimestamp = dayTimestamp - 60 * 60 * 24
    const toTimestamp = dayTimestamp
    const query = `
      {
        poolDayDatas(where:{date_gte: ${fromTimestamp} date_lte: ${toTimestamp}}) {
          volumeUSD
          date
        }
      }`;
    const response: IData[] = (await request(endpoints[chain], query)).poolDayDatas;
    const dailyVolume = response.filter((e: IData) => Number(e.volumeUSD) < 100_000_000)
      .reduce((a: number, b: IData) => a + Number(b.volumeUSD), 0)
    return {
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: fetchVolume(CHAIN.MANTLE),
      start: async () => 1689206400,
    },
  },
};

export default adapter;
