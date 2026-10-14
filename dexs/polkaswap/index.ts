import { gql, request } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint = "https://pi.soramitsu.io/graphql";

const INDEXER_HISTORY_START = 1780272000; // 2026-06-01

const query = gql`
  query daySnapshot($id: String!) {
    networkSnapshots(filter: { id: { equalTo: $id } }) {
      nodes { flowAggregation flowBucketStart flowBucketEnd volumeUSD }
    }
  }`;

const fetch = async (options: FetchOptions) => {
  const { startOfDay, dateString } = options;
  if (startOfDay < INDEXER_HISTORY_START) throw new Error("Polkaswap indexer has no reliable volume before 2026-06-01");

  const { networkSnapshots } = await request(endpoint, query, { id: `network-all-DAY-${startOfDay}` });
  const day = networkSnapshots.nodes[0];
  // CALENDAR = exact flow over the whole UTC day
  if (day?.flowAggregation !== "CALENDAR" || day.flowBucketStart !== startOfDay || day.flowBucketEnd !== startOfDay + 86400 || typeof day.volumeUSD !== "string")
    throw new Error(`Polkaswap indexer has no complete day snapshot for ${dateString}`);

  return { dailyVolume: Number(day.volumeUSD) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SORA],
  start: '2023-01-08',
  methodology: {
    Volume: "Daily network volume from Polkaswap's indexer: each executed liquidityProxy exchange valued at the larger of its input and output USD amounts.",
  },
};

export default adapter;
