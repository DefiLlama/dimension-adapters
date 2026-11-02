import { FetchOptions } from "../../adapters/types";
import { getRelayApiKey, getRelayPage, RELAY_CHAINS } from "../../helpers/relay";
import { RELAY_HISTORY } from "./relayHistory";

// Scrooge's swaps and transfers through Relay, shared by aggregators/scrooge (swaps on one chain) and
// bridge-aggregators/scrooge (across chains). Scrooge's site quotes Relay with the referrer "scrooge.exchange" and pays
// Scrooge's fee to Scrooge's fee wallet as an app fee. Relay's v3 requests API filters by app id only for the key that
// owns the app (any other key gets HTTP 403 APP_FILTER_UNAUTHORIZED) and by referrer only among keyless requests, so
// Scrooge's requests are read from the v2 requests API, which filters by referrer across all requests
// (https://docs.relay.link/references/api/get-requests-v2).
const RELAY_REQUESTS_V2_API = "https://api.relay.link/requests/v2";
const RELAY_REFERRER = "scrooge.exchange";
// Scrooge's first Relay request with its referrer. Its Relay requests before then carry no referrer and are listed in
// ./relayHistory.ts instead, from its first on 2026-10-14.
export const RELAY_START = "2026-10-29";
// Scrooge's fee wallet on EVM chains, shared by aggregators/scrooge and bridge-aggregators/scrooge: ScroogeRouter's
// feeRecipient() (selector 0x46904840 on 0x7668b4F9E949E392DC3A1B562bf03086Fd35bb82, Robinhood Chain), the recipient
// Scrooge names for its app fee on Relay and on Across.
export const FEE_WALLET = "0xd21ba2ac73e7e825f929d4b2f70228e806f439ae";

type RelaySide = { currency?: { chainId?: number }; amountUsd?: string };
type RelayAppFee = { recipient?: string; amountUsd?: string | null };
type RelayRequest = {
  referrer?: string | null;
  // currencyIn is what was sent and currencyOut what arrived; appFees are the quoted app fees and paidAppFees the paid ones
  data?: { metadata?: { currencyIn?: RelaySide; currencyOut?: RelaySide }; appFees?: RelayAppFee[] | null; paidAppFees?: RelayAppFee[] | null };
};
// Dollars by DefiLlama chain, the chain paid from.
export type RelayTotals = { crossChain: Record<string, number>; sameChain: Record<string, number>; sameChainFees: Record<string, number> };

const add = (totals: Record<string, number>, chain: string, usd: number) => { totals[chain] = (totals[chain] ?? 0) + usd; };
const toScrooge = (fees?: RelayAppFee[] | null) => (fees ?? []).filter((f) => f.recipient?.toLowerCase() === FEE_WALLET);

// One request in the totals, on the chain paid from: cross-chain, or same-chain with Scrooge's fee. Relay's USD prices
// break on long-tail tokens (see fees/relay), so where what was sent and what arrived disagree by more than 2x, the
// smaller is counted.
const addRequest = (totals: RelayTotals, fromChainId: number | undefined, toChainId: number | undefined, inUsd: number, outUsd: number, feeUsd: number) => {
  const chain = RELAY_CHAINS[fromChainId as number];
  if (!chain || !Number.isFinite(inUsd)) return;
  const usd = Number.isFinite(outUsd) && (inUsd > 2 * outUsd || outUsd > 2 * inUsd) ? Math.min(inUsd, outUsd) : inUsd;
  if (toChainId !== fromChainId) {
    add(totals.crossChain, chain, usd);
    return;
  }
  add(totals.sameChain, chain, usd);
  // a fee above what was swapped is a mispriced token, as above
  if (feeUsd <= usd) add(totals.sameChainFees, chain, feeUsd);
};

// Scrooge's filled Relay requests per window, shared by every chain, by the time each was made. The window is
// [startTimestamp, endTimestamp) (adapters/utils/runAdapter.ts, since #10547). Before RELAY_START they are the listed
// ones (./relayHistory.ts), and Relay is not asked. From then, one pull by referrer: the API's bounds are inclusive, so
// the query covers [startTimestamp, endTimestamp - 1] and a request on a boundary falls in one window only. A request
// without Scrooge's referrer means the filter was not applied, and the run stops rather than count all of Relay. Any
// caller can send the referrer, so a request counts only where it pays Scrooge's fee wallet an app fee.
export const fetchRelayTotals = async (options: FetchOptions): Promise<RelayTotals> => {
  const totals: RelayTotals = { crossChain: {}, sameChain: {}, sameChainFees: {} };
  for (const [, createdAt, fromChainId, toChainId, inUsd, outUsd, feeUsd] of RELAY_HISTORY) {
    if (createdAt >= options.startTimestamp && createdAt < options.endTimestamp) addRequest(totals, fromChainId, toChainId, inUsd, outUsd, feeUsd);
  }
  if (options.endTimestamp <= Date.parse(RELAY_START) / 1000) return totals;
  const apiKey = getRelayApiKey();
  let continuation: string | undefined;
  do {
    // v2 serves at most 50 requests a page
    const page = await getRelayPage(`${RELAY_REQUESTS_V2_API}?referrer=${RELAY_REFERRER}&startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp - 1}&limit=50&sortBy=createdAt&sortDirection=asc&status=success${continuation ? `&continuation=${encodeURIComponent(continuation)}` : ""}`, apiKey);
    for (const { referrer, data } of page.requests as RelayRequest[]) {
      if (referrer !== RELAY_REFERRER) throw new Error("scrooge: Relay returned a request without Scrooge's referrer");
      if (!toScrooge(data?.appFees).length && !toScrooge(data?.paidAppFees).length) continue;
      const sent = data?.metadata?.currencyIn;
      const arrived = data?.metadata?.currencyOut;
      const fee = toScrooge(data?.paidAppFees).reduce((sum, f) => sum + Number(f.amountUsd ?? 0), 0);
      addRequest(totals, sent?.currency?.chainId, arrived?.currency?.chainId, Number(sent?.amountUsd), Number(arrived?.amountUsd), fee);
    }
    continuation = page.continuation;
  } while (continuation);
  return totals;
};
