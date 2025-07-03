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
    'https://api.studio.thegraph.com/query/46041/impermax-mainnet-v1/v0.0.1',
  ],
  polygon: [
    'https://api.studio.thegraph.com/query/46041/impermax-x-uniswap-v2-polygon-v2/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-polygon-solv2/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-polygon-sol-stable/v0.0.1',
  ],
  arbitrum: [
    'https://api.studio.thegraph.com/query/46041/impermax-arbitrum-v1/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-arbitrum-v2/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-arbitrum-solv2/v0.0.2',
  ],
  optimism: [
    'https://api.studio.thegraph.com/query/46041/impermax-optimism-solv2/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-optimism-solv2-stable/v0.0.1'
  ],
  fantom: [
    'https://api.studio.thegraph.com/query/46041/impermax-fantom-solv1/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-fantom-solv2/v0.0.3',
    'https://api.studio.thegraph.com/query/46041/impermax-fantom-v2/v0.0.2',
  ],
  base: [
    'https://api.studio.thegraph.com/query/46041/impermax-base-solv2/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-base-solv2-stable/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-base-v2/v0.0.3',
  ],
  scroll: [
    'https://api.studio.thegraph.com/query/46041/impermax-scroll-solv2/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-scroll-solv2-stable/0.0.9',
  ],
  real: [
    "https://api.goldsky.com/api/public/project_cm2d5q4l4w31601vz4swb3vmi/subgraphs/impermax-finance/impermax-real-v2-stable/gn",
    "https://api.goldsky.com/api/public/project_cm2rhb30ot9wu01to8c9h9e37/subgraphs/impermax-real-solv2/3.0/gn",
  ],
  avax: [
    'https://api.studio.thegraph.com/query/46041/impermax-avalanche-v1/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-avalanche-solv2/v0.0.3',
  ],
  linea: [
    'https://api.studio.thegraph.com/query/46041/impermax-linea-solv2/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-linea-solv2-stable/v0.0.2',
  ],
  sonic: [
    'https://api.studio.thegraph.com/query/46041/impermax-sonic-solv2/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-sonic-solv2-stable/v0.0.1',
  ],
  blast: [
    'https://api.studio.thegraph.com/query/46041/impermax-blast-solv2/v0.0.3',
    'https://api.studio.thegraph.com/query/46041/impermax-blast-v2/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-blast-solv2-stable/v0.0.2',
  ],
  zksync: [
    'https://api.studio.thegraph.com/query/46041/impermax-zksync-era-solv2/v0.0.2',
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

async function fetch(_timestamp: number, _t: any, options: FetchOptions) {
  const borrowables: IBorrowable[] = await getChainBorrowables(options.chain as any);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  borrowables.forEach((b: IBorrowable) => {
    const { dailyFees: df, dailyRevenue: dr } = calculate(b);
    const decimals = Number(b.underlying.decimals);
    dailyFees.add(b.underlying.id, df * (10 ** decimals));
    dailyRevenue.add(b.underlying.id, dr * (10 ** decimals));
  })

  return {
    dailyFees,
    dailyRevenue,
  };
};



const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.POLYGON]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.FANTOM]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.BASE]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.SCROLL]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.REAL]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.AVAX]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.SONIC]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.BLAST]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.LINEA]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
    [CHAIN.ZKSYNC]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-10-23',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
