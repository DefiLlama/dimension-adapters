import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const BOB_SUBGRAPH = "https://bob-ambient-subgraph.sovryn.app/subgraphs/name/DistributedCollective/bob-ambient-subgraph";
const RSK_SUBGRAPH = "https://subgraph.sovryn.app/subgraphs/name/DistributedCollective/sovryn-subgraph";

async function fetchBob({ startTimestamp, endTimestamp, createBalances }: FetchOptions) {
  const dailyVolume = createBalances();
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const query = gql`{
      swaps(
        where: { time_gte: ${startTimestamp}, time_lt: ${endTimestamp} }
        first: 1000
        skip: ${skip}
        orderBy: time
      ) {
        quoteFlow
        pool {
          quote
        }
      }
    }`;
    const { swaps } = await request(BOB_SUBGRAPH, query);
    for (const swap of swaps) {
      const quoteFlow = BigInt(swap.quoteFlow);
      const absFlow = quoteFlow < 0n ? -quoteFlow : quoteFlow;
      dailyVolume.add(swap.pool.quote, absFlow);
    }
    hasMore = swaps.length === 1000;
    skip += 1000;
  }

  return { dailyVolume };
}

async function fetchRsk({ startTimestamp, endTimestamp, createBalances }: FetchOptions) {
  const dailyVolume = createBalances();
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const query = gql`{
      conversions(
        where: { timestamp_gte: ${startTimestamp}, timestamp_lt: ${endTimestamp} }
        first: 1000
        skip: ${skip}
        orderBy: timestamp
      ) {
        _toToken {
          id
          decimals
        }
        _return
      }
    }`;
    const { conversions } = await request(RSK_SUBGRAPH, query);
    for (const conversion of conversions) {
      const decimals = conversion._toToken.decimals;
      const rawAmount = new BigNumber(conversion._return)
        .times(new BigNumber(10).pow(decimals))
        .toFixed(0);
      dailyVolume.add(conversion._toToken.id, BigInt(rawAmount));
    }
    hasMore = conversions.length === 1000;
    skip += 1000;
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BOB]: {
      fetch: fetchBob,
      start: "2024-04-24",
    },
    [CHAIN.ROOTSTOCK]: {
      fetch: fetchRsk,
      start: "2020-09-30",
    },
  },
};

export default adapter;
