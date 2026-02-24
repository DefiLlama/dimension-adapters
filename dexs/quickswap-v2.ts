import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { uniV2Exports } from "../helpers/uniswap";
import request from "graphql-request"

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint("FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd"),
};

const onChainAdapter: any = uniV2Exports({
  [CHAIN.BASE]: {
    factory: '0xEC6540261aaaE13F236A032d454dc9287E52e56A',
    start: '2020-10-08',
    userFeesRatio: 1,
    revenueRatio: 0.05 / 0.3,
    protocolRevenueRatio: 0.01 / 0.3,
    holdersRevenueRatio: 0.04 / 0.3,

  },
}, { runAsV1: true })

async function fetch(_: any, _1: any, { startOfDay }: FetchOptions) {
  const dayId = Math.floor(startOfDay / 86400)

  const query = `{    uniswapDayData(id: ${dayId}) {      dailyVolumeUSD    }  }`
  const { uniswapDayData: { dailyVolumeUSD } } = await request(endpoints[CHAIN.POLYGON], query)
  const dailyFees = dailyVolumeUSD * 0.003
  return {
    dailyVolume: dailyVolumeUSD,
    dailyFees,
    dailyRevenue: dailyFees * 0.05 / 0.3,
    dailyProtocolRevenue: dailyFees * 0.01 / 0.3,
    dailyHoldersRevenue: dailyFees * 0.04 / 0.3,
    dailySupplySideRevenue: dailyFees * 0.25 / 0.3,
    dailyUserFees: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology: {
    UserFees: "User pays 0.3% fees on each swap.",
    Fees: "0.3% of each swap is collected as trading fees",
    Revenue: "Protocol takes 16.66% of collected fees (0.04% community + 0.01% foundation).",
    ProtocolRevenue: "Foundation receives 3.33% of collected fees (0.01% of swap volume).",
    SupplySideRevenue: "83.33% of collected fees go to liquidity providers (0.25% of swap volume).",
    HoldersRevenue: "Community receives 13.33% of collected fees for buybacks (0.04% of swap volume).",
  },
  adapter: {
    [CHAIN.POLYGON]: { fetch, },
    [CHAIN.BASE]: onChainAdapter!.adapter.base,
    // [CHAIN.DOGECHAIN]: { fetch: getUniV2LogAdapter({ factory: '0xC3550497E591Ac6ed7a7E03ffC711CfB7412E57F', ...univ2LogConfig }), start: '2023-04-11' },
  },
}

export default adapter;
