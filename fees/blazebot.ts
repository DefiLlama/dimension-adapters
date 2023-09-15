import {Adapter, FetchResultFees} from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {Chain} from "@defillama/sdk/build/general";
import {request, gql} from "graphql-request";
import {getTimestampAtStartOfDayUTC} from "../utils/date";
import { getPrices } from "../utils/prices";

type TEndpoint = {
  [s: Chain | string]: string;
}
const endpoints: TEndpoint = {
    [CHAIN.BASE]: "https://subgraphs.blazebot.io/subgraphs/name/blazebot/stats",
}

interface ISwap {
  id: string;
  fee: BigInt;
}
const graphs = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultFees> => {
        const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
        const fromTimestamp = todaysTimestamp - 60 * 60 * 24
        const toTimestamp =todaysTimestamp
        const query = gql`
          {
            fees(where: {
              timestamp_gte: ${fromTimestamp}
              timestamp_lte: ${toTimestamp}
            }, orderBy:fee, orderDirection: desc) {
              id
              fee
            }
          }
        `
      const graphRes: ISwap[] = (await request(endpoints[chain], query)).fees;

      const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
      const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
      const dailyFees = graphRes.map((e: ISwap) => {
        const decimals = 18;
        return (Number(e.fee) / 10 ** decimals) * ethPrice
      }).reduce((a: number, b: number) => a + b, 0)
      return {
        dailyFees: `${dailyFees}`,
        timestamp,
      };
    }
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.BASE]: {
            fetch: graphs(CHAIN.BASE),
            start: async () => 1694131200,
        },
    }
}

export default adapter;
