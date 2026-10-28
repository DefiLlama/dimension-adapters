import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const openinterest_subgraphs: Record<string, string> = {
  [CHAIN.ARBITRUM]: "https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql",
  [CHAIN.AVAX]: "https://gmx.squids.live/gmx-synthetics-avalanche:prod/api/graphql",
  [CHAIN.BOTANIX]: "https://gmx.squids.live/gmx-synthetics-botanix:prod/api/graphql",
  [CHAIN.MEGAETH]: "https://gmx.squids.live/gmx-synthetics-megaeth:prod/api/graphql",
}

const fetchOpenInterest = async (options: FetchOptions) => {
  const query = gql`
    query MyQuery {
      marketInfos(limit: 5000, where: {isDisabled_eq:false}, orderBy:longOpenInterestUsd_DESC) {
        longOpenInterestUsd
        shortOpenInterestUsd
      }
    }
  `
  const res = await request(openinterest_subgraphs[options.chain], query);
  const marketInfos = res.marketInfos || [];
  const longOI = marketInfos.reduce((acc: number, m: any) => acc + Number(m.longOpenInterestUsd), 0);
  const shortOI = marketInfos.reduce((acc: number, m: any) => acc + Number(m.shortOpenInterestUsd), 0);
  // Pool venue: every position is its own contract against the pool (longs and shorts are not
  // matched against each other), so long + short counts each open position exactly once.
  return longOI + shortOI
}

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = await fetchOpenInterest(options) / (10 ** 30)
  return { openInterestAtEnd }
}

const adapter: Adapter = {
  fetch,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2021-08-31', },
    [CHAIN.AVAX]: { start: '2021-12-22', },
    // GMX sunset Botanix on 2026-08-01 and the chain itself shut down, the botanix squid endpoint now 404s
    [CHAIN.BOTANIX]: { start: '2025-05-30', deadFrom: '2026-08-01', },
    [CHAIN.MEGAETH]: { start: '2026-04-08', },
  }
}

export default adapter;
