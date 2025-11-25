import { CHAIN } from "../helpers/chains";
import { request, } from "graphql-request";
import type { FetchOptions, } from "../adapters/types"

const fetch = async (options: FetchOptions) => {
  const query = (block: any) => `{  factory( id: "0x826d713e30f0bf09dd3219494a508e6b30327d4f" block: { number: ${block} } ) {    totalVolumeUSD    totalFeesUSD  }}`;

  const { getFromBlock, getToBlock } = options;
  const url = "https://api.goldsky.com/api/public/project_clz85cxrvng3n01ughcv5e7hg/subgraphs/uniswap-v3-taiko/19044af/gn";
  const fromData = await request(url, query(await getFromBlock()));
  const toData = await request(url, query(await getToBlock()));
  const dailyVolume = toData.factory.totalVolumeUSD - fromData.factory.totalVolumeUSD;
  const dailyFees = toData.factory.totalFeesUSD - fromData.factory.totalFeesUSD;

  return { dailyFees, dailyVolume, dailyRevenue: 0, dailySupplySideRevenue: dailyFees };
}


export default {
  version: 2,
  adapter: {
    [CHAIN.TAIKO]: {
      fetch,
    }
  },
  start: '2025-11-06'
}