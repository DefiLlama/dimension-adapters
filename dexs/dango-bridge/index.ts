import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GRAPHQL = "https://api-mainnet.dango.zone/graphql";

const PAIRS = [
  "perp/btcusd",
  "perp/ethusd",
  "perp/solusd",
  "perp/hypeusd",
];

const query = `
  query perpsCandles(
    $pairId: String!
    $interval: CandleInterval!
    $earlierThan: DateTime
  ) {
    perpsCandles(
      first: 2
      pairId: $pairId
      interval: $interval
      earlierThan: $earlierThan
    ) {
      nodes {
        volumeUsd
      }
    }
  }
`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  let totalVolume = 0;

  const earlierThan = new Date(options.endTimestamp * 1000).toISOString();

  for (const pairId of PAIRS) {
    try {
      const res = await globalThis.fetch(GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: {
            pairId,
            interval: "ONE_DAY",
            earlierThan,
          },
        }),
      }).then((r) => r.json());

      const nodes = res?.data?.perpsCandles?.nodes || [];

      if (nodes.length > 0) {
        totalVolume += Number(nodes[0].volumeUsd || 0);
      }
    } catch (e) {
      console.error(`Dango volume fetch failed for ${pairId}`, e);
    }
  }

  dailyVolume.addUSDValue(totalVolume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.DANGO], 
  start: "2026-01-01",
  fetch,
  methodology: {
    Volume:
      "Total perp trading volume on Dango aggregated from perpsCandles (daily USD volume across all perp markets).",
  },
};

export default adapter;