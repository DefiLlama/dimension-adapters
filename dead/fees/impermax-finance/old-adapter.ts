// WARN: Old adapter with a fixed reserve rate

import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// NOTE: the yields server does not return all pools if liquidity is too low, which
// may result in calculated fees and revenue being lower than what is real
const borrowPool = "https://yields.llama.fi/poolsBorrow";

const methodology = {
  Fees: "Fees are calculated as 90% of the borrowing fees for qualified pools, paid by the borrowers to the lenders.",
  Revenue: "Revenue is the remaining 10% of all collected borrowing fees and go to the protocol.",
}

interface IPoolBorrow {
  chain: string,
  project: string,
  pool: string,
  totalSupplyUsd: number,
  totalBorrowUsd: number,
  tvlUsd: number,
  apyBase: number
  apyBaseBorrow: number
}

const graphs = () => {
  return (chain: CHAIN) => {
    return async (timestamp: number) => {
      const poolsCall: IPoolBorrow[] = (await fetchURL(borrowPool))?.data;

      const pools = poolsCall
        .filter((e: IPoolBorrow) => e.project === "impermax-finance")
        .filter((e: IPoolBorrow) => e.chain.toLowerCase() === chain.toLowerCase());

      // Fees and revenue is derived from borrowing fees: 90% of the borrowing fees
      // go to the lenders, and 10% is routed to the treasury as revenue
      const fees = pools
        .map(pool => pool.totalBorrowUsd * pool.apyBaseBorrow / 100 / 365)
        .reduce((prev, curr) => prev + curr, 0);
      const revenue = fees * .1;
      return {
        timestamp,
        dailyFees: fees.toString(),
        dailyRevenue: revenue.toString(),
      };
    };
  }
};

const adapter: Adapter = {
  methodology,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: graphs()(CHAIN.BASE),
      start: '2023-10-23',
    },
    [CHAIN.REAL]: {
      fetch: graphs()(CHAIN.REAL),
      start: '2023-10-23',
    },
  },
}

export default adapter;
