import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const HISTORY_URL = "https://api.7.exchange/api/v1/transaction/history";

const CHAIN_KEY_TO_CHAIN: Record<string, CHAIN> = {
  "binance-smart-chain": CHAIN.BSC,
  "arbitrum-one": CHAIN.ARBITRUM,
  "base": CHAIN.BASE,
  "ethereum": CHAIN.ETHEREUM,
  "solana": CHAIN.SOLANA,
  "celo": CHAIN.CELO,
  "polygon-pos": CHAIN.POLYGON,
  "avalanche": CHAIN.AVAX,
};

const chains = Array.from(new Set(Object.values(CHAIN_KEY_TO_CHAIN)));

const INTEGRATOR_FEE_TYPE = "integrator_fee";

interface FeeItem {
  type?: string | null;
  amountUsd?: string | number | null;
}

interface HistoryTx {
  amountUsd: number | null;
  createdAt: string;
  fee?: { details?: { items?: FeeItem[] | null } | null } | null;
  srcAsset?: { chain?: string | null };
}

function integratorFeeUsd(tx: HistoryTx): number {
  const items = tx.fee?.details?.items ?? [];
  let total = 0;
  for (const item of items) {
    if (item?.type !== INTEGRATOR_FEE_TYPE) continue;
    const usd = Number(item.amountUsd ?? 0);
    if (Number.isFinite(usd)) total += usd;
  }
  return total;
}

type WindowBreakdown = Partial<Record<CHAIN, { volume: number; fees: number }>>;

const prefetch = async (options: FetchOptions): Promise<any> => {
  const breakdown: WindowBreakdown = {};
  let page = 1;
  const perPage = 50;
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  while (true) {
    const res = await httpGet(
      `${HISTORY_URL}?statuses=SUCCESS&finalizedOnly=true` +
      `&from=${start}&to=${end}&perPage=${perPage}&page=${page}`
    );
    const rows: HistoryTx[] = res?.data ?? [];

    if (rows.length === 0) break;
    for (const tx of rows) {
      const ts = Math.floor(new Date(tx.createdAt).getTime() / 1000);
      if (ts < start || ts >= end) continue;
      const key = tx.srcAsset?.chain ?? undefined;
      const chain = key ? CHAIN_KEY_TO_CHAIN[key] : undefined;
      if (!chain) continue;
      const bucket = (breakdown[chain] ??= { volume: 0, fees: 0 });
      bucket.volume += Number(tx.amountUsd ?? 0);
      bucket.fees += integratorFeeUsd(tx);
    }
    if (res?.pagination?.hasMore !== true) break;
    page += 1;
    await sleep(500);
  }
  return breakdown;
}

const fetch = async (options: FetchOptions) => {
  const breakdown = options.preFetchedResults;
  const { volume = 0, fees = 0 } = breakdown[options.chain as CHAIN] ?? {};

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, "Integrator Fees");

  return {
    dailyVolume: volume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "USD value of finalized swaps routed through 7.exchange in the period, credited to the source chain of each swap.",
  Fees: "Integrator fees charged by 7.exchange on finalized swaps (the integrator_fee item). Excludes gas, relayer, and other third-party costs.",
  Revenue: "All integrator fees charged by 7.exchange are retained by 7.exchange, so revenue equals fees.",
  ProtocolRevenue: "All integrator fees charged by 7.exchange are retained by 7.exchange, so protocol revenue equals fees.",
}

const breakdownMethodology = {
  Fees: {
    "Integrator Fees": "Integrator fees charged by 7.exchange on finalized swaps (the integrator_fee item).",
  },
  Revenue: {
    "Integrator Fees": "Integrator fees charged by 7.exchange on finalized swaps (the integrator_fee item).",
  },
  ProtocolRevenue: {
    "Integrator Fees": "Integrator fees charged by 7.exchange on finalized swaps (the integrator_fee item).",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  prefetch,
  fetch,
  chains,
  start: "2026-05-07",
  methodology,
  breakdownMethodology,
};

export default adapter;
