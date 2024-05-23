import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import {
  SimpleAdapter,
  ChainEndpoints,
  FetchResultVolume,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: ChainEndpoints = {
  [CHAIN.LINEA]:
    "https://graph-query.linea.build/subgraphs/name/Chimp-Exchange/chimp-exchange-subgraph",
};

interface IPool {
  id: string;
  swapVolume: string;
}
interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
}

const graphs = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const startTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const fromTimestamp = startTimestamp - 60 * 60 * 24;
    const toTimestamp = startTimestamp;
    const graphQuery = gql`query fees {
        today:poolSnapshots(where: {timestamp:${toTimestamp}}, orderBy:swapFees, orderDirection: desc) {
          id
          swapVolume
        }
        yesterday:poolSnapshots(where: {timestamp:${fromTimestamp}}, orderBy:swapFees, orderDirection: desc) {
          id
          swapVolume
        }
      }`;
    // const blackList = ['0x93d199263632a4ef4bb438f1feb99e57b4b5f0bd0000000000000000000005c2']
    const graphRes: IPoolSnapshot = await request(endpoints[chain], graphQuery);
    const dailyVolume = graphRes["today"]
      .map((p: IPool) => {
        const yesterdayValue = Number(
          graphRes.yesterday.find(
            (e: IPool) => e.id.split("-")[0] === p.id.split("-")[0]
          )?.swapVolume || "0"
        );
        if (yesterdayValue === 0) return 0;
        return Number(p.swapVolume) - yesterdayValue;
      })
      .filter((e) => e < 100_000_000)
      .reduce((a: number, b: number) => a + b, 0);

    return {
      dailyVolume: `${dailyVolume}`,
      timestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch: graphs(CHAIN.LINEA),
      start: getStartTimestamp({
        endpoints,
        chain: CHAIN.LINEA,
        dailyDataField: `balancerSnapshots`,
        dateField: "timestamp",
        volumeField: "totalSwapVolume",
      }),
    },
  },
};
export default adapter;
