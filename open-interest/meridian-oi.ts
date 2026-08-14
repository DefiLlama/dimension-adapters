import { SimpleAdapter, FetchOptions, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const API = "https://api.predict.meridian.xyz/graphql";

// Daily protocol snapshots; timestamps are UTC-midnight bucket starts and
// amounts are wUSDe wei
const STATS_QUERY = `
  query {
    protocol {
      statsHistory(interval: DAY) {
        nodes {
          timestamp
          openInterest
        }
      }
    }
  }
`;

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const res = await httpPost(API, { query: STATS_QUERY });
  const nodes = res.data.protocol.statsHistory.nodes;
  const day = nodes.find((node: any) => node.timestamp === options.startOfDay);
  if (!day) throw new Error(`Meridian: no protocol stats for day ${options.startOfDay}`);

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addCGToken("ethena-usde", Number(day.openInterest) / 1e18);

  return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-06-29",
};

export default adapter;