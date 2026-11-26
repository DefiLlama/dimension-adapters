import { BaseAdapter, FetchOptions } from '../adapters/types';
import { httpGet } from '../utils/fetchURL';
import { CHAIN } from './chains';
import { RELAY_CHAINS } from './relay';

const API = 'https://api.walletv.io/defillama/relay/daily';

// First UTC day with a successful Wallet V Relay request from each source chain.
const chainStarts: Record<string, string> = {
  [CHAIN.ARBITRUM]: '2025-09-05',
  [CHAIN.SOLANA]: '2025-09-05',
  [CHAIN.HYPERLIQUID]: '2025-09-08',
  [CHAIN.ETHEREUM]: '2025-09-16',
  [CHAIN.BSC]: '2025-09-16',
  [CHAIN.POLYGON]: '2025-09-16',
  [CHAIN.BASE]: '2025-09-16',
  [CHAIN.OPTIMISM]: '2025-09-17',
  [CHAIN.AVAX]: '2025-09-17',
  [CHAIN.TRON]: '2026-08-18',
  [CHAIN.ROBINHOOD]: '2026-09-01',
};

export function walletVRelayChainConfig(): BaseAdapter {
  return Object.fromEntries(Object.entries(chainStarts).map(([chain, start]) => [chain, { start }]));
}

type Metrics = { volumeUsd: number; appFeesUsd: number };
type DailyResponse = {
  code: number;
  data?: { date: string; chains: (Metrics & { originChainId: number })[] };
};

// The runner passes the prefetched data through to each chain's fetch.
export async function prefetchWalletVRelay({ dateString }: FetchOptions): Promise<any> {
  const response: DailyResponse = await httpGet(API, {
    params: { date: dateString },
    timeout: 15_000,
  });
  const day = response?.data;
  if (response?.code !== 0 || day?.date !== dateString || !Array.isArray(day.chains)) {
    throw new Error(`Wallet V Relay: invalid daily response for ${dateString}`);
  }

  const totals: Record<string, Metrics> = {};
  const seen = new Set<number>();
  for (const { originChainId, volumeUsd, appFeesUsd } of day.chains) {
    if (!Number.isSafeInteger(originChainId) || originChainId <= 0 || seen.has(originChainId)
      || !Number.isFinite(volumeUsd) || volumeUsd < 0
      || !Number.isFinite(appFeesUsd) || appFeesUsd < 0) {
      throw new Error(`Wallet V Relay: invalid chain totals for ${dateString}, origin ${originChainId}`);
    }
    seen.add(originChainId);

    const chain = RELAY_CHAINS[originChainId];
    if (!chain || !chainStarts[chain]) {
      console.warn(`Wallet V Relay: unlisted origin chain ${originChainId} on ${dateString}`);
      continue;
    }

    // HyperCore and HyperEVM both map to DefiLlama's hyperliquid chain.
    const chainTotals = totals[chain] ??= { volumeUsd: 0, appFeesUsd: 0 };
    chainTotals.volumeUsd += volumeUsd;
    chainTotals.appFeesUsd += appFeesUsd;
  }
  return totals;
}

export function walletVRelayMetrics({ chain, preFetchedResults }: FetchOptions): Metrics {
  return preFetchedResults[chain] ?? { volumeUsd: 0, appFeesUsd: 0 };
}
