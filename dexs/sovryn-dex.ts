import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const SOVRYN_DEX_BOB = "0xe5bc234A484A912A61Aa74501960cFc202e773dA";
const RSK_SUBGRAPH =
  "https://subgraph.sovryn.app/subgraphs/name/DistributedCollective/sovryn-subgraph";

async function fetchBob({ getLogs, createBalances }: FetchOptions) {
  const dailyVolume = createBalances();

  const logs = await getLogs({
    target: SOVRYN_DEX_BOB,
    eventAbi:
      "event SdexSwap(address indexed base, address indexed quote, uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip, uint128 limitPrice, uint128 minOut, uint8 reserveFlags, int128 baseFlow, int128 quoteFlow)",
  });

  for (const log of logs) {
    const quoteFlow = BigInt(log.quoteFlow);
    const absFlow = quoteFlow < 0n ? -quoteFlow : quoteFlow;
    dailyVolume.add(log.quote, absFlow);
  }

  return { dailyVolume };
}

async function fetchRsk({
  startTimestamp,
  endTimestamp,
  createBalances,
}: FetchOptions) {
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
