import { gql, request } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint = "https://pi.soramitsu.io/graphql";

const INDEXER_HISTORY_START = 1780272000; // 2026-06-01

const SWAP_METHODS = new Set(["swap", "swapTransfer"]);

const query = gql`
  query swapHistory($from: Int!, $to: Int!, $after: Cursor) {
    historyElements(first: 100, after: $after, orderBy: TIMESTAMP_ASC, filter: { and: [
      { module: { equalTo: "liquidityProxy" } },
      { timestamp: { greaterThan: $from } },
      { timestamp: { lessThanOrEqualTo: $to } },
    ] }) {
      pageInfo { hasNextPage endCursor }
      nodes { id method execution data }
    }
  }`;

const fetch = async (options: FetchOptions) => {
  if (options.startOfDay < INDEXER_HISTORY_START) throw new Error("Polkaswap indexer has no complete swap history before 2026-06-01");

  let dailyVolume = 0;
  let after: string | null = null;
  do {
    const { historyElements } = await request(endpoint, query, { from: options.fromTimestamp, to: options.toTimestamp, after });
    for (const { id, method, execution, data } of historyElements.nodes) {
      if (!SWAP_METHODS.has(method) || !execution?.success) continue;
      const baseUSD = Number(data?.baseAssetAmountUSD);
      const targetUSD = Number(data?.targetAssetAmountUSD);
      if (!Number.isFinite(baseUSD) || !Number.isFinite(targetUSD)) throw new Error(`Polkaswap swap ${id} has no USD legs`);
      dailyVolume += Math.min(baseUSD, targetUSD);
    }
    after = historyElements.pageInfo.hasNextPage ? historyElements.pageInfo.endCursor : null;
  } while (after);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SORA],
  start: '2023-01-08',
  methodology: {
    Volume: "Sum over successful liquidityProxy swap and swapTransfer extrinsics of the smaller of the sold and bought USD values, as priced by Polkaswap's indexer.",
  },
};

export default adapter;
