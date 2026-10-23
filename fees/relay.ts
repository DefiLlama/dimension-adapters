import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getRelayApiKey, getRelayPage, RELAY_CHAINS, RELAY_REQUESTS_API } from "../helpers/relay";

// Fee fields: https://docs.relay.link/references/api/api_core_concepts/fees#fees-in-the-api
// platform = Relay's own fee; app = fee the integrator adds on top of the quote, paid to the integrator;
// swap = the solver's spread against the oracle price (on a same-token bridge this is the solver's fee for fronting funds).
// execution (gas) is passed through to the chains and is not counted.
const PLATFORM_FEES = "Platform Fees";
const APP_FEES = "App Fees";
const SOLVER_FEES = "Solver Fees";
// Revenue and supply side are disabled: integrators get a revenue share of 0-67% of the platform fee depending on
// pair type and their trailing 30-day volume tier (see the fees doc above), and the API does not report it per
// request, so platform fees overstate what Relay keeps. Re-enable once the share can be deducted.
// const PLATFORM_FEES_TO_RELAY = "Platform Fees To Relay";
// const APP_FEES_TO_INTEGRATORS = "App Fees To Integrators";
// const SOLVER_FEES_TO_SOLVERS = "Solver Fees To Solvers";

// An hour is ~170 pages at ~2.5s each, too slow sequentially: page 5-minute slices in parallel.
// 12 workers was the fastest tested (~10 pages/s, no 429s); 6 ran at ~5/s and 24 at ~7/s with doubled latency.
const SLICE_SECONDS = 300;
const CONCURRENCY = 12;

type RelayRequest = {
  data?: {
    fees?: { currency?: { chainId: number }; actual?: { platform?: { usd?: string }; swap?: { usd?: string } } } | null;
    appFees?: { currency?: { chainId: number }; actual?: { amountUsd?: string | null }[] } | null;
  };
};
type FeeTotals = { platform: Record<string, number>; app: Record<string, number>; swap: Record<string, number> };

const add = (totals: Record<string, number>, chainId: number | undefined, usd: number) => {
  // superseed and lighter have no CHAIN key; their fees were ~$0 when checked
  const chain = RELAY_CHAINS[chainId as number];
  if (chain) totals[chain] = (totals[chain] ?? 0) + usd;
};

// one paged pull per window, shared by every chain: fees summed by the chain the fee was paid on
const prefetch = async (options: FetchOptions): Promise<FeeTotals> => {
  const apiKey = getRelayApiKey();
  const totals: FeeTotals = { platform: {}, app: {}, swap: {} };
  const slices: number[] = [];
  for (let from = options.startTimestamp; from < options.endTimestamp; from += SLICE_SECONDS) slices.push(from);

  const { errors } = await PromisePool.withConcurrency(CONCURRENCY).for(slices).process(async (from) => {
    const to = Math.min(from + SLICE_SECONDS, options.endTimestamp);
    let continuation: string | undefined;
    do {
      const page = await getRelayPage(`${RELAY_REQUESTS_API}?startTimestamp=${from}&endTimestamp=${to}&limit=100&sortBy=createdAt&sortDirection=asc&status=success${continuation ? `&continuation=${encodeURIComponent(continuation)}` : ""}`, apiKey);
      for (const { data } of page.requests as RelayRequest[]) {
        // fees is null on ~2% of requests (mostly small same-chain swaps), those platform and solver fees are not reported
        const actual = data?.fees?.actual, feeChainId = data?.fees?.currency?.chainId;
        // costs are negative-signed in the API
        if (actual?.platform?.usd) add(totals.platform, feeChainId, -Number(actual.platform.usd));
        // a positive swap value is price improvement for the user, not a negative fee: floor at zero per request
        if (actual?.swap?.usd) add(totals.swap, feeChainId, Math.max(0, -Number(actual.swap.usd)));
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
  const { platform, app, swap }: FeeTotals = options.preFetchedResults;
  const dailyFees = options.createBalances();
  // const dailyRevenue = options.createBalances();
  // const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(platform[options.chain] ?? 0, PLATFORM_FEES);
  dailyFees.addUSDValue(app[options.chain] ?? 0, APP_FEES);
  dailyFees.addUSDValue(swap[options.chain] ?? 0, SOLVER_FEES);
  // dailyRevenue.addUSDValue(platform[options.chain] ?? 0, PLATFORM_FEES_TO_RELAY);
  // dailySupplySideRevenue.addUSDValue(app[options.chain] ?? 0, APP_FEES_TO_INTEGRATORS);
  // dailySupplySideRevenue.addUSDValue(swap[options.chain] ?? 0, SOLVER_FEES_TO_SOLVERS);

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
    Fees: "Relay platform fees, app fees and solver fees paid by users on Relay bridges and swaps, excluding gas. Revenue is not reported because Relay shares part of its platform fee with integrators and the API does not report that share.",
    // Revenue: "Relay platform fees minus the share paid to integrators.",
    // ProtocolRevenue: "Relay platform fees minus the share paid to integrators, kept by Relay.",
    // SupplySideRevenue: "App fees and the platform fee share paid to integrators, and solver fees paid to solvers.",
  },
  breakdownMethodology: {
    Fees: {
      [PLATFORM_FEES]: "Relay's own fee, partly shared with integrators.",
      [APP_FEES]: "Fees integrating apps add on top of the Relay quote, paid to those apps.",
      [SOLVER_FEES]: "Spread charged by the solver that fills the request, versus the market price.",
    },
    // Revenue: {
    //   [PLATFORM_FEES_TO_RELAY]: "Relay's own fee, kept by Relay.",
    // },
    // ProtocolRevenue: {
    //   [PLATFORM_FEES_TO_RELAY]: "Relay's own fee, kept by Relay.",
    // },
    // SupplySideRevenue: {
    //   [APP_FEES_TO_INTEGRATORS]: "Fees integrating apps add on top of the Relay quote, paid to those apps.",
    //   [SOLVER_FEES_TO_SOLVERS]: "Spread kept by the solver that fills the request.",
    // },
  },
};

export default adapter;
