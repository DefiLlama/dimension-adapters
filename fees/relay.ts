import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getRelayApiKey, getRelayPage, RELAY_CHAINS, RELAY_REQUESTS_API } from "../helpers/relay";

// Fee fields: https://docs.relay.link/references/api/api_core_concepts/fees#fees-in-the-api
// platform = Relay's own fee; app = fee the integrator adds on top of the quote, paid to the integrator.
// swap (solver/LP price) and execution (gas) are costs passed through to third parties and are not counted.
const PLATFORM_FEES = "Platform Fees";
const APP_FEES = "App Fees";
// Revenue and supply side are disabled: integrators get a revenue share of 0-67% of the platform fee depending on
// pair type and their trailing 30-day volume tier (see the fees doc above), and the API does not report it per
// request, so platform fees overstate what Relay keeps. Re-enable once the share can be deducted.
// const PLATFORM_FEES_TO_RELAY = "Platform Fees To Relay";
// const APP_FEES_TO_INTEGRATORS = "App Fees To Integrators";

// An hour is ~170 pages at ~2.5s each, too slow sequentially: page 5-minute slices in parallel.
// 12 workers was the fastest tested (~10 pages/s, no 429s); 6 ran at ~5/s and 24 at ~7/s with doubled latency.
const SLICE_SECONDS = 300;
const CONCURRENCY = 12;

type RelayRequest = {
  data?: {
    fees?: { currency?: { chainId: number }; actual?: { platform?: { usd?: string } } } | null;
    appFees?: { currency?: { chainId: number }; actual?: { amountUsd?: string | null }[] } | null;
  };
};
type FeeTotals = { platform: Record<string, number>; app: Record<string, number> };

const add = (totals: Record<string, number>, chainId: number | undefined, usd: number) => {
  // superseed and lighter have no CHAIN key; their fees were ~$0 when checked
  const chain = RELAY_CHAINS[chainId as number];
  if (chain) totals[chain] = (totals[chain] ?? 0) + usd;
};

// one paged pull per window, shared by every chain: fees summed by the chain the fee was paid on
const prefetch = async (options: FetchOptions): Promise<FeeTotals> => {
  const apiKey = getRelayApiKey();
  const totals: FeeTotals = { platform: {}, app: {} };
  const slices: number[] = [];
  for (let from = options.startTimestamp; from < options.endTimestamp; from += SLICE_SECONDS) slices.push(from);

  const { errors } = await PromisePool.withConcurrency(CONCURRENCY).for(slices).process(async (from) => {
    const to = Math.min(from + SLICE_SECONDS, options.endTimestamp);
    let continuation: string | undefined;
    do {
      const page = await getRelayPage(`${RELAY_REQUESTS_API}?startTimestamp=${from}&endTimestamp=${to}&limit=100&sortBy=createdAt&sortDirection=asc&status=success${continuation ? `&continuation=${encodeURIComponent(continuation)}` : ""}`, apiKey);
      for (const { data } of page.requests as RelayRequest[]) {
        // fees is null on ~2% of requests (mostly small same-chain swaps), those platform fees are not reported
        const platformUsd = data?.fees?.actual?.platform?.usd;
        // costs are negative-signed in the API
        if (platformUsd) add(totals.platform, data!.fees!.currency?.chainId, -Number(platformUsd));
        // appFees[].amountUsd, not fees.actual.app.usd: the latter is mispriced on some tokens (a $0.003 fee read as $1.17M)
        for (const fee of data?.appFees?.actual ?? [])
          if (fee.amountUsd) add(totals.app, data!.appFees!.currency?.chainId, Number(fee.amountUsd));
      }
      continuation = page.continuation;
    } while (continuation);
  });
  if (errors.length) throw errors[0];
  return totals;
};

const fetch = async (options: FetchOptions) => {
  const { platform, app }: FeeTotals = options.preFetchedResults;
  const dailyFees = options.createBalances();
  // const dailyRevenue = options.createBalances();
  // const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(platform[options.chain] ?? 0, PLATFORM_FEES);
  dailyFees.addUSDValue(app[options.chain] ?? 0, APP_FEES);
  // dailyRevenue.addUSDValue(platform[options.chain] ?? 0, PLATFORM_FEES_TO_RELAY);
  // dailySupplySideRevenue.addUSDValue(app[options.chain] ?? 0, APP_FEES_TO_INTEGRATORS);

  // return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch: prefetch as any,
  // fees only until the integrator revenue share can be deducted (see the note on the commented-out revenue labels)
  skipBreakdownValidation: true,
  chains: [...new Set(Object.values(RELAY_CHAINS))],
  // the API returns no fees for ~90-98% of requests from 2025-12-08 to 2026-04-23, and no platform fees before 2025-05
  start: "2026-04-24",
  methodology: {
    Fees: "Relay platform fees plus integrator (app) fees paid by users on successful Relay bridge and swap requests, by the chain the fee is paid on. Gas and solver swap costs are excluded. Revenue is not reported because Relay pays integrators a revenue share of up to 67% of its platform fee, set by volume tier, and the API does not report it per request.",
    // Revenue: "Relay platform fees paid by users on successful requests, minus the revenue share paid to integrators.",
    // ProtocolRevenue: "Relay platform fees paid by users on successful requests, minus the revenue share paid to integrators, kept by Relay.",
    // SupplySideRevenue: "Integrator (app) fees charged by apps built on Relay, plus the platform fee revenue share paid to integrators.",
  },
  breakdownMethodology: {
    Fees: {
      [PLATFORM_FEES]: "Relay's own fee on successful requests; up to 67% of it can be shared with integrators depending on their volume tier.",
      [APP_FEES]: "Fees the integrating app adds on top of the Relay quote, paid to that app.",
    },
    // Revenue: {
    //   [PLATFORM_FEES_TO_RELAY]: "Relay's own fee on successful requests, kept by Relay.",
    // },
    // ProtocolRevenue: {
    //   [PLATFORM_FEES_TO_RELAY]: "Relay's own fee on successful requests, kept by Relay.",
    // },
    // SupplySideRevenue: {
    //   [APP_FEES_TO_INTEGRATORS]: "Fees set by the integrating app, paid in full to that app.",
    // },
  },
};

export default adapter;
