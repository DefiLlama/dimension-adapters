import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";


type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchURLWithRetry(url: string, options: FetchOptions) {
  const start = options.startOfDay;
  const key = `${url}-${start}`;
  if (!requests[key])
    requests[key] = queryDune("4514149", {
      start: start,
      end: start + (24 * 60 * 60),
    })
  return requests[key]
}

const fetchFees = async (_t: any, _b: any ,options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const res = await fetchURLWithRetry("4514149", options);
  const fees = res.find((e: any) => e.chain === options.chain);
  dailyFees.addUSDValue(fees.fees_usd);
  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: "2024-10-16",
    },
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: "2024-10-16",
    },
  },
}

export default adapter;
