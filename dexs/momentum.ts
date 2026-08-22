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

const fetch = async (_: any): Promise<FetchResultV2> => {
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
  let dailyProtocolRevenue = 0;
  let dailySupplySideRevenue = 0;
  const response = await httpGet('https://api.mmt.finance/pools/v3');
  for (const poolData of response.data) {
    const poolFees = Number(poolData.fees24h);
    const protocolShare = Number(poolData.protocolFeesPercent) / 100;
    dailyVolume += Number(poolData.volume24h);
    dailyFees += poolFees;
    dailyProtocolRevenue += poolFees * protocolShare;
    dailySupplySideRevenue += poolFees * (1 - protocolShare);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  // start: '2025-03-08',
  runAtCurrTime: true,
  methodology: {
    Fees: 'Gross swap fees paid by users across all CLMM pools.',
    Revenue: "Each pool's protocolFeesPercent of swap fees redirected to the Momentum treasury.",
    ProtocolRevenue: "Each pool's protocolFeesPercent of swap fees redirected to the Momentum treasury.",
    SupplySideRevenue: "Remaining share of swap fees distributed to liquidity providers.",
  }
};

export default adapter;