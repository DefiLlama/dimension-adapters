import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Daily app-fee rollup served by the Based trading API, backed by its Relay
// request ledger (reconciled against Relay /requests/v3 every 5 minutes).
const API_URL = "https://trading-api.based.one/api/onchain-swap/fees/daily";

interface DailyFeeRow {
  date: string; // YYYY-MM-DD (UTC)
  chainId: number; // Relay origin chain id of the swap
  feesUsd: string; // app fees earned that day on that chain, USD
}

// Relay chain id -> DefiLlama chain slug. Swaps originating on chains not
// listed here (new chains Based enables later) are attributed to Base, where
// Relay settles all app fees in USDC.
const RELAY_CHAIN_TO_SLUG: Record<number, string> = {
  1: CHAIN.ETHEREUM,
  56: CHAIN.BSC,
  137: CHAIN.POLYGON,
  988: CHAIN.STABLE,
  999: CHAIN.HYPERLIQUID, // HyperEVM
  1337: CHAIN.HYPERLIQUID, // Hyperliquid core (Relay id)
  4663: CHAIN.ROBINHOOD,
  5042: CHAIN.ARC,
  8453: CHAIN.BASE,
  42161: CHAIN.ARBITRUM,
  57073: CHAIN.INK,
  792703809: CHAIN.SOLANA,
};

const prefetch = async (options: FetchOptions): Promise<DailyFeeRow[]> => {
  const res = await httpGet(
    `${API_URL}?start=${options.dateString}&end=${options.dateString}`,
  );
  const rows: DailyFeeRow[] = res?.data;
  if (!Array.isArray(rows)) throw new Error("Unexpected fees API response");
  return rows;
};

const fetch = async (options: FetchOptions) => {
  const rows: DailyFeeRow[] = options.preFetchedResults || [];

  const dailyFees = options.createBalances();
  for (const row of rows) {
    const slug = RELAY_CHAIN_TO_SLUG[row.chainId] ?? CHAIN.BASE;
    if (slug !== options.chain) continue;
    dailyFees.addUSDValue(Number(row.feesUsd), "Swap app fees");
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "1% (100 bps) app fee charged on swaps routed through Relay, collected in USDC. Reported per origin chain of the swap.",
  Revenue: "All app fees accrue to the Based protocol; there is no supply-side or holder share.",
  ProtocolRevenue: "Identical to Revenue: the full app fee is kept by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    "Swap app fees": "100 bps fee applied to swap volume routed through Relay.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  chains: [...new Set(Object.values(RELAY_CHAIN_TO_SLUG))],
  start: "2026-07-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
