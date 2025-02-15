import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import { query } from "./query";
import { BLACKLIST } from "./blacklist";

const methodology = {
  Fees: "Fees is the interest rate paid by borrowers",
  Revenue: "Percentage of interest going to treasury, based on each lending pool's reserve factor.",
};


const config = {
  ethereum: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/Dn5WZv53V1K8LrKqqYn29hhuhpwfuFfmsrsTqMgFjrD3",
  ],
  polygon: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/F3BfecWo2by5QKrwhkXwuXjyLZnQqJ1wqoejwe67KuyG",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/5JbuAaWwyRm78yWpRCJJS217hXXft59g9MbsjTTZnYQa",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/Giwg5N4SCehmUzNwXtAQZnZvUuTjcp7cr3nzUZosRDFU",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/EWckMdMiZeDSGHxq2V8gZBDF549Xjr9iKkPvisqckF11",
  ],
  arbitrum: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/3PMyaq269mDMwhJ7E285RYD1r43x996b6xZmJSCGvtkm",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/BkMRb8mR5zgCbjFSgau6s27pnANhR6k64RGVKUbWaZdY",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/AdLbcSfG6JnpZ7RDdHNHq3bJ21waGnRi7AJ5x3YFGYFo",
  ],
  optimism: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/74C2pMzH3wNKf38PNheGZfSiY4FzmJoKiGtHLYa7oD2s",
  ],
  fantom: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/8vssJypWas5oenzsjjQq1yLqMe7FRt2evcqZdzCNEWt7",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/DJ2bTPinDji7Kwev3WjyfxRo487tJHiEEMEo8kmTMT8F",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/DPk9E2c9fLKF8N6rN3jcyvSrEq4VEgjdeeJcnaEKAngG",
  ],
  base: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/8PC37V463j8CmiYiLv1SEKdeqbV1bBj1gPzwLa7xoHEG",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/9wN7xinUXf8RP8dbwpkzSmCNQKfz31FDpvPEvTQyT8SL",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/B7xsBeef3FohKaFPcsAsviyLKaWXTqcSELjAsPj2B7iW",
  ],
  scroll: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/9HL6kLRt3AbQsprTvk7KZdaHunJ5GGsLdYWd27nNfCFC",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/C42ymmkDArE1T5wdYKwao6mntqNSjP2E34TeGusiF3sk",
  ],
  real: [
    "https://api.goldsky.com/api/public/project_cm2d5q4l4w31601vz4swb3vmi/subgraphs/impermax-finance/impermax-real-v2-stable/gn",
    "https://api.goldsky.com/api/public/project_cm2rhb30ot9wu01to8c9h9e37/subgraphs/impermax-real-solv2/3.0/gn",
  ],
  avax: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/HXhHppWXhFqgLfdmTahFj2x7F5Xq8BwADxGY3nbCUAwr",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/8Gz5ZGyRkSA7WBrSteeyez39AgZQsoEbtXe8GtHD7JMQ",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/78e6cZp11r2coLx8YYo5y4AqzEhQXYT6sw3Bg5Tiy5XU",
  ],
  linea: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/AyFSeFRAtUm4aY3cb1zTJqoMjcgSNrRipucuSxkEZ1v9",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/Ah5k6hzS9YicNHWuA4Uts9MQQQGbPLDtwD8tYjKaX8Ls"
  ],
  sonic: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/HK9BA4oFp1xaoQW7YVP4m2nbxX7q2bQCZWNPKBtudtZR",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/61ZJXkM5uRGntP1HZkmH4iaKRzsf1BBhQdZYi9euLkpM"
  ],
  blast: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/4FDikpVjE2XnDJ5QcpQ1YJXWcUDiAgE7x8ErtsHh33UB",
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/6xkrXFPJ4wqh9cy9ayP19WGr2wZVSMP3FniMjcW2LUG4",
  ],
  zksync: [
    "https://gateway.thegraph.com/api/1350441d268f171aeb0934412dfadf3b/subgraphs/id/8YSS88X8ChDw1QvuAMtxjezSXNiYer9k9d3Uu8XFLHzX",
  ]
};

interface IBorrowable {
  id: string;
  borrowRate: string;
  reserveFactor: string;
  totalBorrows: string;
  accrualTimestamp: string;
  underlying: {
    id: string;
    decimals: string;
  };
  lendingPool: {
    id: string;
  };
}

const getChainBorrowables = async (chain: CHAIN): Promise<IBorrowable[]> => {
  const urls = config[chain];
  let allBorrowables: IBorrowable[] = [];

  for (const url of urls) {
    const queryResult = await request(url, query);
    allBorrowables = allBorrowables.concat(queryResult.borrowables);
  }

  const blacklist = BLACKLIST[chain] || [];
  return allBorrowables.filter(i => !blacklist.includes(i.lendingPool.id));
};

const calculate = (
  borrowable: IBorrowable,
): { dailyFees: number; dailyRevenue: number } => {
  const { totalBorrows, borrowRate, reserveFactor } = borrowable;


  const dailyBorrowAPR = Number(borrowRate) * 86400;
  const dailyFees = (Number(totalBorrows) * dailyBorrowAPR)
  const dailyRevenue = dailyFees * Number(reserveFactor);

  return { dailyFees, dailyRevenue };
};

const graphs = () => {
  return (chain: CHAIN) => {
    return async (timestamp: number, _t: any, options: FetchOptions) => {
      const borrowables: IBorrowable[] = await getChainBorrowables(chain);
      const dailyFees = options.createBalances();
      const dailyRevenue = options.createBalances();
      borrowables.forEach((b: IBorrowable) => {
        const { dailyFees: df, dailyRevenue: dr } = calculate(b);
        const decimals = Number(b.underlying.decimals);
        dailyFees.add(b.underlying.id, df * (10 ** decimals));
        dailyRevenue.add(b.underlying.id, dr * (10 ** decimals));
      })

      return {
        timestamp,
        dailyFees: dailyFees,
        dailyRevenue: dailyRevenue,
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs()(CHAIN.ETHEREUM),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.POLYGON]: {
      fetch: graphs()(CHAIN.POLYGON),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.ARBITRUM]: {
      fetch: graphs()(CHAIN.ARBITRUM),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.FANTOM]: {
      fetch: graphs()(CHAIN.FANTOM),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.BASE]: {
      fetch: graphs()(CHAIN.BASE),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.SCROLL]: {
      fetch: graphs()(CHAIN.SCROLL),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.OPTIMISM]: {
      fetch: graphs()(CHAIN.OPTIMISM),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.REAL]: {
      fetch: graphs()(CHAIN.REAL),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.AVAX]: {
      fetch: graphs()(CHAIN.AVAX),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.SONIC]: {
      fetch: graphs()(CHAIN.SONIC),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.BLAST]: {
      fetch: graphs()(CHAIN.BLAST),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.LINEA]: {
      fetch: graphs()(CHAIN.LINEA),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.ZKSYNC]: {
      fetch: graphs()(CHAIN.ZKSYNC),
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
