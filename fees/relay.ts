import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getRelayApiKey, getRelayPage, RELAY_CHAINS, RELAY_REQUESTS_API } from "../helpers/relay";

// Fee fields: https://docs.relay.link/references/api/api_core_concepts/fees#fees-in-the-api
// platform = service fee for routing, solving and settling across chains; app = fee the integrator adds on top of the
// quote, paid to the integrator; swap = cost of facilitating cross-asset and cross-chain swaps, including asset rebalancing.
// execution (cost to execute and settle on the destination chain) is not counted.
const PLATFORM_FEES = "Platform Fees";
const APP_FEES = "App Fees";
const SWAP_COSTS = "Swap Costs";
// Revenue and supply side are disabled: integrators get a revenue share of 0-67% of the platform fee depending on
// pair type and their trailing 30-day volume tier (see the fees doc above), and the API does not report it per
// request, so platform fees overstate what Relay keeps. Re-enable once the share can be deducted.
// const PLATFORM_FEES_TO_RELAY = "Platform Fees To Relay";
// const APP_FEES_TO_INTEGRATORS = "App Fees To Integrators";
// const SWAP_COSTS_TO_SOLVERS = "Swap Costs To Solvers";

// An hour is ~170 pages at ~2.5s each, too slow sequentially: page 5-minute slices in parallel.
// 12 workers was the fastest tested (~10 pages/s, no 429s); 6 ran at ~5/s and 24 at ~7/s with doubled latency.
const SLICE_SECONDS = 300;
const CONCURRENCY = 12;

type RelayRequest = {
  data?: {
    route?: { actual?: { origin?: { inputCurrency?: { amountUsd?: string } } } };
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
        // fees is null on ~2% of requests (mostly small same-chain swaps), those platform fees and swap costs are not reported
        const actual = data?.fees?.actual, feeChainId = data?.fees?.currency?.chainId;
        // costs are negative-signed in the API
        const platformUsd = -Number(actual?.platform?.usd ?? 0);
        // a positive swap value is price improvement for the user, not a negative fee: floor at zero per request
        const swapUsd = Math.max(0, -Number(actual?.swap?.usd ?? 0));
        // appFees[].amountUsd, not fees.actual.app.usd: the latter is mispriced on some tokens (a $0.003 fee read as $1.17M)
        const appUsd = (data?.appFees?.actual ?? []).reduce((sum, fee) => sum + Number(fee.amountUsd ?? 0), 0);

        // fees above the amount the user sent are bad data (mostly inputs the API has no USD price for): skip the request
        if (platformUsd + swapUsd + appUsd > Number(data?.route?.actual?.origin?.inputCurrency?.amountUsd)) continue;
        add(totals.platform, feeChainId, platformUsd);
        add(totals.swap, feeChainId, swapUsd);
        add(totals.app, data?.appFees?.currency?.chainId, appUsd);
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
  dailyFees.addUSDValue(swap[options.chain] ?? 0, SWAP_COSTS);
  // dailyRevenue.addUSDValue(platform[options.chain] ?? 0, PLATFORM_FEES_TO_RELAY);
  // dailySupplySideRevenue.addUSDValue(app[options.chain] ?? 0, APP_FEES_TO_INTEGRATORS);
  // dailySupplySideRevenue.addUSDValue(swap[options.chain] ?? 0, SWAP_COSTS_TO_SOLVERS);

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
    Fees: "Relay platform fees, app fees and swap costs paid by users on Relay bridges and swaps, excluding execution costs. Revenue is not reported because Relay shares part of its platform fee with integrators and the API does not report that share.",
    // Revenue: "Relay platform fees minus the share paid to integrators.",
    // ProtocolRevenue: "Relay platform fees minus the share paid to integrators, kept by Relay.",
    // SupplySideRevenue: "App fees and the platform fee share paid to integrators, and swap costs paid to solvers.",
  },
  breakdownMethodology: {
    Fees: {
      [PLATFORM_FEES]: "Relay's service fee for routing, solving and settling across chains, partly shared with integrators.",
      [APP_FEES]: "Fees integrating apps add on top of the Relay quote, paid to those apps.",
      [SWAP_COSTS]: "Cost of facilitating cross-asset and cross-chain swaps, including asset rebalancing.",
    },
    // Revenue: {
    //   [PLATFORM_FEES_TO_RELAY]: "Relay's own fee, kept by Relay.",
    // },
    // ProtocolRevenue: {
    //   [PLATFORM_FEES_TO_RELAY]: "Relay's own fee, kept by Relay.",
    // },
    // SupplySideRevenue: {
    //   [APP_FEES_TO_INTEGRATORS]: "Fees integrating apps add on top of the Relay quote, paid to those apps.",
    //   [SWAP_COSTS_TO_SOLVERS]: "Swap costs kept by the solver that fills the request.",
    // },
  },
};

export default adapter;
