import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";
import { request, } from "graphql-request";

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
  return async (timestamp: number, _: ChainBlocks, { createBalances, fromTimestamp, toTimestamp }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances()
    const query = `
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

    graphRes.map((e: ISwap) => dailyFees.addGasToken(e.fee, "Trading bot swap fees"))
    return { dailyFees, timestamp }
  }
}

const breakdownMethodology = {
  Fees: {
    "Trading bot swap fees": "Fees collected in native gas token from users executing swaps through the BlazeBot trading bot.",
  },
  Revenue: {
    "Trading bot swap fees": "Revenue collected in native gas token from users executing swaps through the BlazeBot trading bot.",
  },
};

const adapter: Adapter = {
  methodology: {
    Fees: "All trading fees paid by users while using trading bot.",
    Revenue: 'All trading fees paid by users while using trading bot.',
  },
  breakdownMethodology,
  deadFrom: "2024-03-12",
  adapter: {
    [CHAIN.BASE]: {
      fetch: async (timestamp: number) => { return { timestamp } },
      start: '2023-09-08',
    },
  }
}

export default adapter;
