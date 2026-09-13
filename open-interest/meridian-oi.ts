import { SimpleAdapter, FetchOptions, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const API = "https://api.predict.meridian.xyz/graphql";
// This GraphQL parser 400s on commas in argument lists; keep them omitted.
const PAGE_SIZE = 25; // `first` > 25 is rejected

// Daily protocol snapshots. `interval: DAY` downsamples to one UTC-midnight
// node per day. Amounts are USDe wei (18 dp).
const STATS_QUERY = `
  query ProtocolStatsHistoryPage( $interval: TimeInterval $first: Int $after: String ) {
    protocol {
      statsHistory(interval: $interval first: $first after: $after) {
        nodes {
          timestamp
          openInterest
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

type StatNode = { timestamp: number; openInterest: string | number };

async function fetchDayStat(dayStart: number): Promise<StatNode> {
  const dayEnd = dayStart + 86400;
  let after: string | null = null;
  let day: StatNode | undefined;

  do {
    const res = await httpPost(API, {
      query: STATS_QUERY,
      variables: { interval: "DAY", first: PAGE_SIZE, after },
    });
    if (res.errors) throw new Error(`Meridian: GraphQL error ${JSON.stringify(res.errors)}`);

    const hist = res?.data?.protocol?.statsHistory;
    const nodes: StatNode[] = hist?.nodes ?? [];
    if (!nodes.length) break;

    for (const n of nodes) {
      if (n.timestamp >= dayStart && n.timestamp < dayEnd) {
        if (!day || n.timestamp >= day.timestamp) day = n;
      }
    }

    const lastTs = nodes[nodes.length - 1].timestamp;
    if (day || lastTs >= dayEnd) break;

    after = hist.pageInfo?.hasNextPage ? hist.pageInfo.endCursor : null;
  } while (after);

  if (!day) throw new Error(`Meridian: no protocol stats snapshot for day ${dayStart}`);
  return day;
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const day = await fetchDayStat(options.startOfDay);

  const openInterestAtEnd = options.createBalances();
  // BigInt scalar may serialize as string or number; normalize via String()
  openInterestAtEnd.addCGToken("ethena-usde", Number(String(day.openInterest)) / 1e18);

  return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-06-29",
  methodology: {
    OpenInterest: "Outstanding prediction-market notional (USDe) from Meridian's daily protocol stats snapshot.",
  },
};

export default adapter;
