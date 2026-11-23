import { FetchOptions } from "../../adapters/types";
import { RELAY_CHAINS } from "../../helpers/relay";
import { httpGet } from "../../utils/fetchURL";

// PicoSwap (https://picoswap.xyz, app https://app.picoswap.xyz, https://x.com/picoswapxyz): a non-custodial swap and
// bridge app. Swaps are routed through Relay (same-chain and cross-chain), with a "better price" route through 0x on
// EVM chains or Jupiter on Solana when that pays out more. PicoSwap's fee is a Relay app fee (0.2%, 0.1% on major
// pairs, 0% between stablecoins; 0.5% during the first beta day, 2026-11-15), half of which funds the USDC Rewards
// pool paid back to traders.
//
// Relay's requests API cannot list PicoSwap's swaps for a third party (v3 filters by app only for the key that owns
// the app, and by referrer only among keyless requests), so PicoSwap publishes its own daily rollup of the Relay
// request ledger it syncs every minute, plus its direct 0x/Jupiter swaps:
// https://app.picoswap.xyz/api/stats/daily?date=YYYY-MM-DD (UTC day, per Relay origin chain id). A day is served with
// `complete: true` only once the ledger sync has checked past its end; until then the adapter throws.
// The same totals are on https://app.picoswap.xyz/treasury (fee ledger) and https://app.picoswap.xyz/api/fee-ledger.
export const STATS_API = "https://app.picoswap.xyz/api/stats/daily";
export const START = "2026-11-15";

// Chains PicoSwap swaps from, as Relay chain ids (https://app.picoswap.xyz/docs/getting-started/supported-chains).
const PICOSWAP_CHAIN_IDS = [
  792703809, 1, 8453, 42161, 10, 137, 56, 43114, 999, 143, 59144, 324, 534352, 146, 5000, 57073, 480, 42220, 9745, 25,
  4326, 4663, 5042, 99901, 8253038, 130, 2741, 80094, 1868,
];
export const CHAINS = [...new Set(PICOSWAP_CHAIN_IDS.map((id) => RELAY_CHAINS[id]).filter(Boolean))];

type Leg = { swaps: number; volumeUsd: number };
export type PicoSwapChainDay = {
  chainId: number;
  relay: { sameChain: Leg; crossChain: Leg; fees: { rewardsPoolUsd: number; picoswapUsd: number } };
  direct: { swaps: number; volumeUsd: number; feesUsd: number };
};
type PicoSwapDay = { date: string; complete: boolean; chains: PicoSwapChainDay[] };

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

// One request per day, shared by every chain (prefetch). Throws on anything but a complete, well-formed day, and on a
// chain with activity that is not listed above, so no volume is dropped silently.
export const fetchDay = async (options: FetchOptions): Promise<PicoSwapDay> => {
  const day: PicoSwapDay = await httpGet(`${STATS_API}?date=${options.dateString}`);
  if (!day || day.date !== options.dateString || !Array.isArray(day.chains)) throw new Error("picoswap: unexpected stats response");
  if (day.complete !== true) throw new Error(`picoswap: stats for ${options.dateString} are not complete yet`);
  for (const row of day.chains) {
    const values = [row?.relay?.sameChain?.volumeUsd, row?.relay?.crossChain?.volumeUsd, row?.relay?.fees?.rewardsPoolUsd, row?.relay?.fees?.picoswapUsd, row?.direct?.volumeUsd, row?.direct?.feesUsd];
    if (!values.every(finite)) throw new Error(`picoswap: malformed stats row ${JSON.stringify(row)}`);
    const active = values.some((value) => (value as number) > 0);
    if (active && !CHAINS.includes(RELAY_CHAINS[row.chainId])) throw new Error(`picoswap: activity on unlisted chain id ${row.chainId}`);
  }
  return day;
};

// The rows of a day paid from this DefiLlama chain.
export const rowsFor = (options: FetchOptions): PicoSwapChainDay[] =>
  (options.preFetchedResults as PicoSwapDay).chains.filter((row) => RELAY_CHAINS[row.chainId] === options.chain);
