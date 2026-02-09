import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { request, } from "graphql-request";

type TEndpoint = {
  [s: CHAIN | string]: string;
}
const endpoints: TEndpoint = {
  [CHAIN.BASE]: "https://subgraphs.blazebot.io/subgraphs/name/blazebot/stats",
}

interface ISwap {
  id: string;
  fee: BigInt;
}

const fetch = async (_a: any, _b: any, { createBalances, fromTimestamp, toTimestamp, chain }: FetchOptions): Promise<FetchResultFees> => {
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

  graphRes.map((e: ISwap) => dailyFees.addGasToken(e.fee, METRIC.TRADING_FEES))
  return { dailyFees }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees collected in native gas token from users executing swaps through the BlazeBot trading bot.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Revenue collected in native gas token from users executing swaps through the BlazeBot trading bot.",
  },
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.BASE],
  start: '2023-09-08',
  deadFrom: "2024-03-12",
  methodology: {
    Fees: "All trading fees paid by users while using trading bot.",
    Revenue: 'All trading fees paid by users while using trading bot.',
  },
  breakdownMethodology,
}

export default adapter;
