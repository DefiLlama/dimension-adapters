import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { BLACKLIST } from "./blacklist";

const config: Record<string, Array<string>> = {
  [CHAIN.BASE]: [
    'https://api.studio.thegraph.com/query/46041/impermax-v-3-base/v0.0.3',
  ],
  [CHAIN.UNICHAIN]: [
    'https://api.studio.thegraph.com/query/46041/impermax-v-3-unichain/v0.0.2',
  ],
  [CHAIN.HYPERLIQUID]: [
    'https://api.goldsky.com/api/public/project_cm2d5q4l4w31601vz4swb3vmi/subgraphs/impermax-v3-hyperevm/0.0.1/gn',
  ]
};

const query = gql`
  {
    borrowables {
      id
      totalBalance
      totalBorrows
      reserveFactor
      borrowRate
      accrualTimestamp
      underlying {
        id
        name
        symbol
        decimals
      }
      lendingPool {
        id
      }
    }
  }
`;

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
  return allBorrowables.filter(i => !blacklist.map(i => i.toLowerCase()).includes(i.lendingPool.id.toLowerCase()));
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
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Fees is the interest rate paid by borrowers",
  Revenue: "Percentage of interest going to treasury, based on each lending pool's reserve factor.",
  ProtocolRevenue: "Percentage of interest going to treasury, based on each lending pool's reserve factor.",
};


const adapter: Adapter = {
  runAtCurrTime: true,
  fetch,
  deadFrom: "2026-02-04",
  methodology,
  adapter: {
    [CHAIN.BASE]: { start: '2023-10-23', },
    [CHAIN.UNICHAIN]: { start: '2023-10-23', },
    [CHAIN.HYPERLIQUID]: { start: '2023-10-23', },
  },
};

export default adapter;
