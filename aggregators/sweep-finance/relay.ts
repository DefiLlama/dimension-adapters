import { FetchOptions } from "../../adapters/types";
import { RELAY_CHAINS } from "../../helpers/relay";
import { RELAY_HISTORY } from "./relayHistory";

// Sweep's swaps and transfers through Relay, shared by aggregators/sweep-finance (swaps on one chain) and
// bridge-aggregators/sweep-finance (across chains). Sweep quotes Relay with its own API key and pays Sweep's fee to
// Sweep's fee wallet as an app fee; since 2026-11-10 it also sends the referrer "trysweep.finance". Relay's v3 requests
// API shows requests made with a key to the integrator that owns the key alone, and v2, which filters by referrer across
// all requests, is retired on 2026-11-24 (https://docs.relay.link/references/api/api_guides/migrating-to-requests-v3).
// So, as in aggregators/scrooge/relayHistory.ts, Sweep's requests are listed with the figures Relay reports for them
// (./relayHistory.ts), and requests made after RELAY_LISTED_UNTIL are not counted until the list is extended.

// The list holds the requests made before this day (UTC).
export const RELAY_LISTED_UNTIL = "2026-11-18";

// Dollars by DefiLlama chain, the chain paid from.
export type RelayTotals = { crossChain: Record<string, number>; sameChain: Record<string, number> };

const add = (totals: Record<string, number>, chain: string, usd: number) => { totals[chain] = (totals[chain] ?? 0) + usd; };

// Relay's USD prices break on long-tail tokens (see fees/relay): where what was sent and what arrived disagree by more
// than 2x, the smaller of the two is counted.
const priced = (counted: number, other: number) => (counted > 2 * other || other > 2 * counted ? Math.min(counted, other) : counted);

// Sweep's listed requests made in [startTimestamp, endTimestamp), on the chain paid from: one to another chain at what
// was sent, one on a single chain at what arrived, as Sweep's other legs and swaps are counted.
export const relayTotals = (options: FetchOptions): RelayTotals => {
  const totals: RelayTotals = { crossChain: {}, sameChain: {} };
  for (const [id, createdAt, fromChainId, toChainId, sentUsd, arrivedUsd] of RELAY_HISTORY) {
    if (createdAt < options.startTimestamp || createdAt >= options.endTimestamp) continue;
    const chain = RELAY_CHAINS[fromChainId];
    if (!chain) throw new Error(`sweep-finance: Relay request ${id} is paid from chain ${fromChainId}, which has no DefiLlama chain`);
    if (fromChainId === toChainId) add(totals.sameChain, chain, priced(arrivedUsd, sentUsd));
    else add(totals.crossChain, chain, priced(sentUsd, arrivedUsd));
  }
  return totals;
};
