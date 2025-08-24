import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/47039/thirdfy-base/version/latest";

interface PoolDayData {
  id: string;
  date: number;
  volumeUSD: string;
  feesUSD: string;
  tvlUSD: string;
  pool: {
    id: string;
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const startTimestamp = options.startTimestamp;
  const endTimestamp = options.endTimestamp;

  const query = `
    query {
      poolDayDatas(
        where: { 
          date_gte: ${startTimestamp}
          date_lt: ${endTimestamp}
        }
        orderBy: date
        orderDirection: desc
        first: 1000
      ) {
        id
        date
        volumeUSD
        feesUSD
        tvlUSD
        pool {
          id
        }
      }
    }
  `;

  const data = await request(SUBGRAPH_URL, query);
  const poolDayDatas: PoolDayData[] = data?.poolDayDatas || [];

  let totalVolumeUSD = 0;
  let totalFeesUSD = 0;

  for (const dayData of poolDayDatas) {
    totalVolumeUSD += parseFloat(dayData.volumeUSD || '0');
    totalFeesUSD += parseFloat(dayData.feesUSD || '0');
  }

  dailyVolume.addUSDValue(totalVolumeUSD);
  dailyFees.addUSDValue(totalFeesUSD);

  return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees };
};

const methodology = {
  Volume: 'Volume of all spot token swaps that go through the protocol.',
  Fees: 'Swap fees paid by users.',
  UserFees: 'Swap fees paid by users.',
  Revenue: 'No protocol revenue.',
  SupplySideRevenue: 'All swap fees distributed to suppliers.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: 1752451200,
  methodology,
};

export default adapter;
