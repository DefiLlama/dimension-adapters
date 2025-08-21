import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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

  // Query subgraph for daily pool data within the time range
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

  try {
    const response = await globalThis.fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    const poolDayDatas: PoolDayData[] = data.data?.poolDayDatas || [];

    // Aggregate daily metrics across all pools
    let totalVolumeUSD = 0;
    let totalFeesUSD = 0;

    for (const dayData of poolDayDatas) {
      totalVolumeUSD += parseFloat(dayData.volumeUSD || '0');
      totalFeesUSD += parseFloat(dayData.feesUSD || '0');
    }

    // Add to balances (DeFiLlama expects USD values)
    dailyVolume.addUSDValue(totalVolumeUSD);
    dailyFees.addUSDValue(totalFeesUSD);

  } catch (error) {
    console.error('Error fetching from subgraph:', error);
    // Return empty balances on error
  }

  return { dailyVolume, dailyFees };
};

const methodology = {
  Fees: 'Swap fees paid by users.',
  Volume: 'Volume of all spot token swaps that go through the protocol.'
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: 1752451200,
  methodology
};

export default adapter;
