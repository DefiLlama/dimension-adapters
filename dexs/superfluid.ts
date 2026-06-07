import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";
import ADDRESSES from "../helpers/coreAssets.json";

// Superfluid streams ERC-20 SuperTokens continuously by computing recipients'
// balances at read-time rather than emitting per-tick transfers. Two agreement
// types are used: CFA (Constant Flow Agreement) for sender->receiver constant-rate
// flows, and GDA (General Distribution Agreement) for pool-based one-to-many
// distributions. Volume is the value delivered to recipients per chain.
//
// CFA flows do NOT fire on-chain Transfer events while running. Each CFA flow
// segment is captured as a `StreamPeriod` with `flowRate`, `startedAtTimestamp`,
// and (eventually) `stoppedAtTimestamp`. We sum the per-window apportioned
// time-integral `flowRate * (effectiveEnd - effectiveStart)` across every
// StreamPeriod that overlaps the [from, to) window. GDA instant distributions
// fire one-shot events with `actualAmount` which we sum directly. GDA
// continuous flow distributions are omitted (sub-1% of total volume per
// cumulative aggregates) and would require a separate pool-flow time-integral.
//
// The time-integral is trustworthy here in a way it was not for LlamaPay or
// Sablier: every Superfluid stream is backed by a buffer deposit (typically ~4
// hours of streamed amount). If the sender goes insolvent, the stream
// auto-liquidates and the deposit is settled to the receiver (or burned).
// Permissionless unfunded high-rate streams that poisoned LlamaPay's Σ-rate
// metric are not possible here; what is streamed is, in expectation,
// delivered. Pre-funded buffers also mean there is no withdraw-event we could
// sum instead -- recipient balances accrue via accounting, with no Transfer
// emitted until the recipient later moves the SuperToken.
//
// Each chain has its own self-hosted subgraph at
// `subgraph-endpoints.superfluid.dev`. No unified multi-chain indexer exists.

const PAGE_SIZE = 1000;

const CONFIG: Record<string, { endpoint: string; start: string; wnative: string }> = {
  [CHAIN.ETHEREUM]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/eth-mainnet/protocol-v1",
    start: "2022-12-15",
    wnative: ADDRESSES.ethereum.WETH,
  },
  [CHAIN.OPTIMISM]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/optimism-mainnet/protocol-v1",
    start: "2022-04-15",
    wnative: ADDRESSES.optimism.WETH_1,
  },
  [CHAIN.BSC]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/bsc-mainnet/protocol-v1",
    start: "2022-06-29",
    wnative: ADDRESSES.bsc.WBNB,
  },
  [CHAIN.XDAI]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/xdai-mainnet/protocol-v1",
    start: "2021-03-05",
    wnative: ADDRESSES.xdai.WXDAI,
  },
  [CHAIN.POLYGON]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/polygon-mainnet/protocol-v1",
    start: "2021-03-08",
    wnative: ADDRESSES.polygon.WMATIC_2,
  },
  [CHAIN.BASE]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1",
    start: "2023-08-07",
    wnative: ADDRESSES.base.WETH,
  },
  [CHAIN.ARBITRUM]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/arbitrum-one/protocol-v1",
    start: "2022-03-16",
    wnative: ADDRESSES.arbitrum.WETH,
  },
  [CHAIN.CELO]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/celo-mainnet/protocol-v1",
    start: "2023-03-13",
    wnative: ADDRESSES.celo.CELO,
  },
  [CHAIN.AVAX]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/avalanche-c/protocol-v1",
    start: "2022-05-17",
    wnative: ADDRESSES.avax.WAVAX,
  },
  [CHAIN.SCROLL]: {
    endpoint: "https://subgraph-endpoints.superfluid.dev/scroll-mainnet/protocol-v1",
    start: "2024-01-31",
    wnative: ADDRESSES.scroll.WETH,
  },
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface Token {
  id: string;
  decimals: number;
  isNativeAssetSuperToken: boolean;
  underlyingAddress: string;
  underlyingToken: { decimals: number } | null;
}

interface StreamPeriod {
  id: string;
  flowRate: string;
  startedAtTimestamp: string;
  stoppedAtTimestamp: string | null;
  token: Token;
}

interface InstantDist {
  id: string;
  actualAmount: string;
  pool: { token: Token };
}

// StreamPeriods that overlap [from, to). `open=true` returns still-flowing
// periods (stoppedAtTimestamp is null); `open=false` returns closed periods
// whose stoppedAtTimestamp falls within or after window start.
const buildStreamPeriodQuery = (toTs: number, fromTs: number, open: boolean, cursor: string) => `{
  streamPeriods(
    first: ${PAGE_SIZE}
    where: {
      startedAtTimestamp_lt: "${toTs}"
      ${open ? "stoppedAtTimestamp: null" : `stoppedAtTimestamp_gte: "${fromTs}"`}
      id_gt: "${cursor}"
    }
    orderBy: id
  ) {
    id
    flowRate
    startedAtTimestamp
    stoppedAtTimestamp
    token {
      id
      decimals
      isNativeAssetSuperToken
      underlyingAddress
      underlyingToken { decimals }
    }
  }
}`;

const buildInstantDistQuery = (fromTs: number, toTs: number, cursor: string) => `{
  instantDistributionUpdatedEvents(
    first: ${PAGE_SIZE}
    where: {
      timestamp_gte: "${fromTs}"
      timestamp_lt: "${toTs}"
      actualAmount_gt: "0"
      id_gt: "${cursor}"
    }
    orderBy: id
  ) {
    id
    actualAmount
    pool {
      token {
        id
        decimals
        isNativeAssetSuperToken
        underlyingAddress
        underlyingToken { decimals }
      }
    }
  }
}`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const cfg = CONFIG[options.chain];
  const from = options.fromTimestamp;
  const to = options.toTimestamp;

  // Generic Subgraph cursor-paginator: walks one query type until a page
  // returns fewer than PAGE_SIZE rows. The query builder receives the last
  // seen `id` for the next page's `id_gt` filter.
  const paginate = async <T extends { id: string }>(
    buildQuery: (cursor: string) => string,
    extractRows: (data: any) => T[]
  ): Promise<T[]> => {
    const all: T[] = [];
    let cursor = "";
    while (true) {
      const res: { data: any } = await postURL(cfg.endpoint, { query: buildQuery(cursor) });
      const page = extractRows(res.data);
      if (!page.length) break;
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
      cursor = page[page.length - 1].id;
    }
    return all;
  };

  const [closedPeriods, openPeriods, instantDists] = await Promise.all([
    paginate<StreamPeriod>(
      (c) => buildStreamPeriodQuery(to, from, false, c),
      (d) => d.streamPeriods
    ),
    paginate<StreamPeriod>(
      (c) => buildStreamPeriodQuery(to, from, true, c),
      (d) => d.streamPeriods
    ),
    paginate<InstantDist>(
      (c) => buildInstantDistQuery(from, to, c),
      (d) => d.instantDistributionUpdatedEvents
    ),
  ]);

  // SuperTokens are normalized to 18 decimals; underlying may differ
  // (USDC=6, WBTC=8). Convert SuperToken wei -> underlying wei before
  // calling balances.add (which prices against the underlying).
  const addStreamed = (token: Token, supertokenWei: bigint) => {
    if (supertokenWei <= 0n) return;
    const underlyingDecimals = token.underlyingToken?.decimals ?? 18;
    const shift = 18 - underlyingDecimals;
    const underlyingWei = shift > 0 ? supertokenWei / 10n ** BigInt(shift) : supertokenWei;
    if (underlyingWei === 0n) return;

    // Native-asset SuperTokens (ETHx, MATICx, AVAXx, ...) carry a zero-address
    // `underlyingAddress`. Substitute the chain's wrapped-native for pricing.
    const priceAddress = token.isNativeAssetSuperToken ? cfg.wnative : token.underlyingAddress;
    if (!priceAddress || priceAddress === ZERO_ADDRESS) return;

    dailyVolume.add(priceAddress, underlyingWei);
  };

  // CFA: apportion each StreamPeriod's flow to the window.
  for (const p of closedPeriods) {
    const effStart = Math.max(from, Number(p.startedAtTimestamp));
    const effEnd = Math.min(to, Number(p.stoppedAtTimestamp));
    if (effEnd <= effStart) continue;
    addStreamed(p.token, BigInt(p.flowRate) * BigInt(effEnd - effStart));
  }
  for (const p of openPeriods) {
    const effStart = Math.max(from, Number(p.startedAtTimestamp));
    const effEnd = to;
    if (effEnd <= effStart) continue;
    addStreamed(p.token, BigInt(p.flowRate) * BigInt(effEnd - effStart));
  }

  // GDA: instant distributions deliver `actualAmount` at one moment.
  for (const d of instantDists) {
    addStreamed(d.pool.token, BigInt(d.actualAmount));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "Value delivered to Superfluid stream recipients per chain. Data is sourced from Superfluid's public self-hosted subgraphs.",
  },
  adapter: CONFIG,
  fetch,
};

export default adapter;
