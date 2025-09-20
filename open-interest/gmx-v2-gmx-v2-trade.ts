import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const openinterest_subgraphs: Record<string, string> = {
  [CHAIN.ARBITRUM]: "https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql",
  [CHAIN.AVAX]: "https://gmx.squids.live/gmx-synthetics-avalanche:prod/api/graphql",
  [CHAIN.BOTANIX]: "https://gmx.squids.live/gmx-synthetics-botanix:prod/api/graphql",
}

const fetchOpenInterest = async (options: FetchOptions) => {
  const query = gql`
    query MyQuery {
      marketInfos {
        id
        isDisabled
        longOpenInterestUsd
        shortOpenInterestUsd
      }
    }
  `
  const res = await request(openinterest_subgraphs[options.chain], query);
  const marketInfos = res.marketInfos || [];
  const longOI = marketInfos.reduce((acc: number, m: any) => acc + Number(m.longOpenInterestUsd), 0);
  const shortOI = marketInfos.reduce((acc: number, m: any) => acc + Number(m.shortOpenInterestUsd), 0);
  return longOI + shortOI
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const openInterestAtEnd = await fetchOpenInterest(options) / (10 ** 30)
  return { openInterestAtEnd }
}

const adapter: Adapter = {
  fetch,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2021-08-31', },
    [CHAIN.AVAX]: { start: '2021-12-22', },
    [CHAIN.BOTANIX]: { start: '2025-05-30', }
  }
}

export default adapter;
