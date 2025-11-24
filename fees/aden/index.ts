import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// // Previously it was Orderly Network(0.4 bps on taker volume) and Aster Exchange(0.4 bps on taker volume)

// let asterBuilderData: any = null
// async function asterFetch(_: any, _1: any, { dateString }: FetchOptions) {
//   const asterVolumeEndpoint = "https://fapi.asterdex.com/fapi/v1/statisticsData/adenTradingInfo?period=DAILy";
//   if (!asterBuilderData) asterBuilderData = httpGet(asterVolumeEndpoint).then(({ perps: data }) => {
//     const dateDataMap: any = {}
//     data.forEach((i: any) => {
//       dateDataMap[i.dateString] = i
//     })
//     return dateDataMap
//   })
//   const data = (await asterBuilderData)[dateString]
//   if (!data)
//     throw new Error('Data missing for date: ' + dateString)
//   const dailyVolume = +data.takerVolume + +data.makerVolume
//   const dailyFees = +data.builderFee
//   const response: any = { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 }
//   return response
// }

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<any> {
  if (options.chain !== CHAIN.GATE_LAYER) {
    return {
      dailyVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: 0,
    };
  }

  const endpointWithDate = `https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama?date=${options.dateString}`;

  const data = await fetchURL(endpointWithDate);

  if (!data) {
    throw new Error("Data missing for date: " + options.dateString);
  }

  return {
    dailyVolume: data.volume,
    dailyFees: data.fees,
    dailyRevenue: data.fees,
    dailyProtocolRevenue: data.fees,
    dailyHoldersRevenue: 0,
  };
}

const methodology = {
  Fees: "Builder Fees collected from Gate Layer Network(0.4 bps on taker volume)",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue go to the protocol",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.GATE_LAYER, CHAIN.ORDERLY, CHAIN.OFF_CHAIN],
  doublecounted: true,
  start: '2025-07-19',
  methodology,
};

export default adapter;
