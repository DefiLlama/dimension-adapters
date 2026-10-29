import { FetchOptions } from "../../adapters/types";
import { getRelayApiKey, getRelayPage, RELAY_CHAINS, RELAY_REQUESTS_API } from "../../helpers/relay";
import { getEnv } from "../../helpers/env";

// Scrooge's swaps and transfers through Relay, shared by aggregators/scrooge (swaps on one chain) and
// bridge-aggregators/scrooge (across chains). Scrooge quotes Relay with its own API key, so every request it makes is
// under Scrooge's Relay app id, which Relay's requests API filters by
// (https://docs.relay.link/references/api/get-requests), and pays Scrooge's fee to Scrooge's fee wallet as an app fee.
const RELAY_APP_ID = "app_id_517dc2a9-faf4-452d-b3ac-20b653265a70";
// Scrooge's first Relay request under its app id.
export const RELAY_START = "2026-10-14";
const FEE_WALLET = "0xd21ba2ac73e7e825f929d4b2f70228e806f439ae";

type RelaySide = { currency?: { chainId?: number }; amountUsd?: string };
type RelayRequest = {
  data?: {
    route?: { actual?: Partial<Record<"origin" | "destination", { inputCurrency?: RelaySide; outputCurrency?: RelaySide }>> };
    appFees?: { quoted?: { recipient?: string }[]; actual?: { recipient?: string; amountUsd?: string | null }[] } | null;
  };
};
// Dollars by DefiLlama chain, the chain paid from.
export type RelayTotals = { crossChain: Record<string, number>; sameChain: Record<string, number>; sameChainFees: Record<string, number> };

const add = (totals: Record<string, number>, chain: string, usd: number) => { totals[chain] = (totals[chain] ?? 0) + usd; };

// One pull of Scrooge's filled Relay requests per window, shared by every chain, by the time each was made. The API's
// bounds are inclusive and the runner's startTimestamp is a second before the window, so the query covers
// [startTimestamp + 1, endTimestamp - 1]: a request on a boundary falls in one window only. Relay's USD prices break on long-tail
// tokens (see fees/relay), so where what was sent and what arrived disagree by more than 2x, the smaller is counted.
// Every request under Scrooge's app id pays Scrooge's fee wallet; one that does not means the filter was not applied,
// and the run stops rather than count all of Relay.
export const fetchRelayTotals = async (options: FetchOptions): Promise<RelayTotals> => {
  const totals: RelayTotals = { crossChain: {}, sameChain: {}, sameChainFees: {} };
  // Relay's API needs a key. A run without one (a pull request's CI has no secrets) counts no Relay volume and says so,
  // rather than failing every chain.
  if (!getEnv("RELAY_API_KEY")) {
    console.log("scrooge: RELAY_API_KEY is not set, Relay volume is not counted");
    return totals;
  }
  const apiKey = getRelayApiKey();
  let continuation: string | undefined;
  do {
    const page = await getRelayPage(`${RELAY_REQUESTS_API}?appId=${RELAY_APP_ID}&startTimestamp=${options.startTimestamp + 1}&endTimestamp=${options.endTimestamp - 1}&limit=100&sortBy=createdAt&sortDirection=asc&status=success${continuation ? `&continuation=${encodeURIComponent(continuation)}` : ""}`, apiKey);
    for (const { data } of page.requests as RelayRequest[]) {
      const paysScrooge = [...(data?.appFees?.quoted ?? []), ...(data?.appFees?.actual ?? [])].some((f) => f.recipient?.toLowerCase() === FEE_WALLET);
      if (!paysScrooge) throw new Error("scrooge: Relay returned a request outside Scrooge's app id");
      const route = data?.route?.actual;
      const sent = route?.origin?.inputCurrency;
      const arrived = (route?.destination ?? route?.origin)?.outputCurrency;
      const chain = RELAY_CHAINS[sent?.currency?.chainId as number];
      const inUsd = Number(sent?.amountUsd);
      const outUsd = Number(arrived?.amountUsd);
      if (!chain || !Number.isFinite(inUsd)) continue;
      const usd = Number.isFinite(outUsd) && (inUsd > 2 * outUsd || outUsd > 2 * inUsd) ? Math.min(inUsd, outUsd) : inUsd;
      if (arrived?.currency?.chainId !== sent?.currency?.chainId) {
        add(totals.crossChain, chain, usd);
        continue;
      }
      add(totals.sameChain, chain, usd);
      const fee = (data?.appFees?.actual ?? []).filter((f) => f.recipient?.toLowerCase() === FEE_WALLET).reduce((sum, f) => sum + Number(f.amountUsd ?? 0), 0);
      // a fee above what was swapped is a mispriced token, as above
      if (fee <= usd) add(totals.sameChainFees, chain, fee);
    }
    continuation = page.continuation;
  } while (continuation);
  return totals;
};
