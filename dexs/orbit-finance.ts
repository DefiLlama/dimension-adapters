import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';

const ADAPTER_BASE = "https://orbit-dex.api.cipherlabsx.com";

interface AdapterPool {
  id: string;
  quoteMint: string;
  baseFeeBps: number;
}

async function fetch() {
  const poolsResp = await fetchURL(`${ADAPTER_BASE}/api/v1/pools`);
  const pools: AdapterPool[] = Array.isArray(poolsResp?.pools)
    ? poolsResp.pools
    : [];

  if (pools.length === 0) {
    return { dailyVolume: 0, dailyFees: 0 };
  }

  const poolIds = pools.map((p) => p.id);
  const quoteMints = [...new Set(pools.map((p) => p.quoteMint))];

  const [volResp, priceResp] = await Promise.all([
    fetchURL(`${ADAPTER_BASE}/api/v1/volumes?tf=24h&pools=${poolIds.join(",")}`),
    fetchURL(`${ADAPTER_BASE}/api/v1/tokens/prices?mints=${quoteMints.join(",")}`),
  ]);

  const volumes: Record<string, number> = volResp?.volumes ?? {};

  const priceMap: Record<string, number> = {};
  for (const p of priceResp?.prices ?? []) {
    if (p?.mint && p.priceUsd != null && Number.isFinite(p.priceUsd)) {
      priceMap[p.mint] = p.priceUsd;
    }
  }

  let dailyVolume = 0;
  let dailyFees = 0;

  for (const pool of pools) {
    const volQuote = volumes[pool.id] ?? 0;
    const quotePrice = priceMap[pool.quoteMint] ?? 0;
    const volUsd = volQuote * quotePrice;

    dailyVolume += volUsd;
    dailyFees += volUsd * ((pool.baseFeeBps ?? 0) / 10_000);
  }

  return { dailyVolume, dailyFees };
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2025-01-01',
      meta: {
        methodology: {
          Volume: "Sum of 24h swap volume across all CipherDLMM pools, converted to USD via quote token prices.",
          Fees: "Volume multiplied by each pool's fee rate (base_fee_bps / 10000).",
        },
      },
    },
  },
};
