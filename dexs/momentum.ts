import { httpGet } from "../utils/fetchURL"
import { FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";

// type IUrl = {
//   [s: string]: string;
// }

// const url: IUrl = {
//   [CHAIN.SUI]: `https://app.sentio.xyz/api/v1/insights/mmt-finance/clmm-dashboard/query`
// }

// const options = {
//   headers: {
//     'Content-Type': 'application/json',
//     'api-key': 'sd0mYLVwi9gZx8l0FHryM5pQY5VEbU8RX',
//   },
// };

const fetch = async (_t: any, _b: any, _options: FetchOptions): Promise<FetchResultV2> => {
  // const data = {
  //   timeRange: {
  //     start: startOfDay.toString(),
  //     end: (startOfDay + 86400).toString(),
  //     step: 3600,
  //   },
  //   queries: [
  //     {
  //       metricsQuery: {
  //         query: 'SwapInVolumeUsdCounter',
  //         aggregate: {
  //           op: 'SUM',
  //         },
  //       },
  //       dataSource: 'METRICS',
  //     },
  //   ],
  //   cachePolicy: {
  //     noCache: true,
  //   },
  // };
  // const res = await postURL(url[chain], data, 3, options);
  // const values = res?.results?.[0]?.matrix?.samples?.[0]?.values;
  // if (!values || values.length < 2)
  //   throw new Error('No data found for the given time range');

  // let dailyVolume = 0;

  // const beginVolume = Number(values[0].value);
  // const latestVolume = Number(values[values.length - 1].value);
  // dailyVolume = latestVolume - beginVolume;
  
  let dailyVolume = 0;
  let dailyFees = 0;
  const response = await httpGet('https://api.mmt.finance/pools/v3');
  for (const poolData of response.data) {
    dailyVolume += Number(poolData.volume24h);
    dailyFees += Number(poolData.fees24h);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees * 0.2,
    dailyProtocolRevenue: dailyFees * 0.2,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      // start: '2025-03-08',
      runAtCurrTime: true,
    }
  },
  methodology: {
    Fees: 'All swap fees paid by users from 6 fee tiers pools.',
    Revenue: 'Amount of 20% swap fees is redirected to the Momentum treasury.',
    ProtocolRevenue: 'Amount of 20% swap fees is redirected to the Momentum treasury.',
  }
};

export default adapter;