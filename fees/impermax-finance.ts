import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

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
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs()(CHAIN.ETHEREUM),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: graphs()(CHAIN.POLYGON),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    [CHAIN.ARBITRUM]: {
      fetch: graphs()(CHAIN.ARBITRUM),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch: graphs()(CHAIN.AVAX),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    // disable beacause api is not include chain moonriver and canto yet
    // [CHAIN.MOONRIVER]: {
    //   fetch: graphs()(CHAIN.MOONRIVER),
      // runAtCurrTime: true,
    //   start: 1698019200,
    //   meta: {
    //     methodology
    //   }
    // },
    // [CHAIN.CANTO]: {
    //   fetch: graphs()(CHAIN.CANTO),
      // runAtCurrTime: true,
    //   start: 1698019200,
    //   meta: {
    //     methodology
    //   }
    // },
    [CHAIN.ERA]: {
      fetch: graphs()(CHAIN.ERA),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    [CHAIN.FANTOM]: {
      fetch: graphs()(CHAIN.FANTOM),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    [CHAIN.BASE]: {
      fetch: graphs()(CHAIN.BASE),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    [CHAIN.SCROLL]: {
      fetch: graphs()(CHAIN.SCROLL),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
    [CHAIN.OPTIMISM]: {
      fetch: graphs()(CHAIN.OPTIMISM),
      runAtCurrTime: true,
      start: 1698019200,
      meta: {
        methodology
      }
    },
  },
}

export default adapter;
