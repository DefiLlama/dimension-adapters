import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../chains";
import { httpGet } from "../../utils/fetchURL";

// swap stats API: swaps bucketed by the hour they were created, on the chain they sold from
const API = "https://metro.exchange/api/v1/defillama";

// first day with swaps on each chain; before 2022-04-24 the API spreads the weekly totals evenly across hours, all under thorchain
export const chainStarts: Record<string, string> = {
  [CHAIN.THORCHAIN]: "2021-04-01",
  [CHAIN.TERRA]: "2022-04-24",
  [CHAIN.BSC]: "2022-04-25",
  [CHAIN.ETHEREUM]: "2022-04-25",
  [CHAIN.BITCOIN]: "2022-06-23",
  [CHAIN.LITECOIN]: "2022-06-24",
  [CHAIN.BITCOIN_CASH]: "2022-06-25",
  [CHAIN.DOGE]: "2022-06-27",
  [CHAIN.COSMOS]: "2022-07-14",
  [CHAIN.AVAX]: "2022-10-03",
  [CHAIN.POLKADOT]: "2024-02-29",
  [CHAIN.DASH]: "2024-04-15",
  [CHAIN.ARBITRUM]: "2024-04-17",
  // kujira is in deadChains, so it never runs: its rows are loan opens, not swaps, so there is nothing to report
  [CHAIN.KUJIRA]: "2024-04-17",
  [CHAIN.MAYA]: "2024-04-21",
  [CHAIN.RADIXDLT]: "2024-09-03",
  [CHAIN.SOLANA]: "2024-09-26",
  [CHAIN.BASE]: "2025-01-14",
  [CHAIN.RIPPLE]: "2025-06-05",
  [CHAIN.TRON]: "2025-07-17",
  [CHAIN.ZEC]: "2025-08-21",
  [CHAIN.OPTIMISM]: "2025-10-02",
  [CHAIN.NEAR]: "2025-10-16",
  [CHAIN.POLYGON]: "2025-10-29",
  [CHAIN.MONAD]: "2025-11-24",
  [CHAIN.SUI]: "2025-12-01",
  [CHAIN.XLAYER]: "2025-12-11",
  [CHAIN.BERACHAIN]: "2026-01-13",
  [CHAIN.XDAI]: "2026-01-13",
  [CHAIN.STARKNET]: "2026-02-05",
  [CHAIN.CARDANO]: "2026-02-18",
  [CHAIN.TON]: "2026-03-19",
  [CHAIN.STELLAR]: "2026-07-09",
  [CHAIN.ALEO]: "2026-07-30",
  [CHAIN.ROBINHOOD]: "2026-09-05",
  [CHAIN.HYPERLIQUID]: "2026-10-11",
};

// a fresh object per adapter: setModuleDefaults writes each adapter's fetch into these chain configs, so sharing one would make every adapter run the first one's fetch
export const adapterChains = () => Object.fromEntries(
  Object.entries(chainStarts).map(([chain, start]) => [chain, { start }])
);

type TokenLine = { asset: string; usd: string; amount: string; llamaToken?: string; rawAmount?: string; coingeckoId?: string };
type FeeLine = { label: string; usd: string };

export type ChainStats = {
  aggregatorVolumeUsd: string;
  bridgeAggregatorVolumeUsd: string;
  aggregatorVolumeTokens: TokenLine[];
  bridgeAggregatorVolumeTokens: TokenLine[];
  fees?: FeeLine[];
  protocolRevenue?: FeeLine[];
  holdersRevenue?: FeeLine[];
};

// every chain of an adapter run shares one request per window
const windows: Record<string, Promise<Record<string, ChainStats>>> = {};

export async function getChainStats({ startTimestamp: from, endTimestamp: to, chain }: FetchOptions): Promise<ChainStats | undefined> {
  // prod slices start and end a second before the hour, the API takes whole hours
  const startTimestamp = Math.ceil(from / 3600) * 3600;
  const endTimestamp = Math.ceil(to / 3600) * 3600;
  const key = `${startTimestamp}-${endTimestamp}`;
  windows[key] ??= httpGet(`${API}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`)
    .then((res) => {
      // final is false until the window ended 2h+ ago and a rollup ran, so throw to have the window retried
      if (!res.final) throw new Error(`swap stats api: window ${key} is not final yet`);
      return res.chains;
    })
    .catch((error) => {
      delete windows[key];
      throw error;
    });
  const chains = await windows[key];
  return chains[chain];
}

// price each line by its token where the API gives an exact amount, then add what the lines don't cover as USD so the total matches the API
export function addVolume(balances: any, totalUsd: string, lines: TokenLine[] = []) {
  let covered = 0;
  for (const line of lines) {
    if (line.llamaToken && line.rawAmount) balances.add(line.llamaToken, line.rawAmount, { skipChain: true });
    else if (line.coingeckoId) balances.addCGToken(line.coingeckoId, Number(line.amount));
    else balances.addUSDValue(Number(line.usd));
    covered += Number(line.usd);
  }
  const rest = Number(totalUsd) - covered;
  if (rest > 0.005) balances.addUSDValue(rest);
}

export function addFees(balances: any, lines: FeeLine[]) {
  for (const line of lines) balances.addUSDValue(Number(line.usd), line.label);
}
