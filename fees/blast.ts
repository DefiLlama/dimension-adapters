import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const launchpadLabels = {
  creation: "Launch creation fees",
  curve_swaps: "Bonding curve swap fees",
  migration: "Launch migration fees",
  presale_raise: "Presale raise fees",
} as const;

const frontendLabels = {
  cetus: "Blast frontend fees on Cetus",
  aftermath: "Blast frontend fees on Aftermath",
} as const;

const labels = new Map(Object.entries({ ...launchpadLabels, ...frontendLabels }));

/** Read Blast's published fees and revenue for the requested UTC window. */
async function fetch({ startTimestamp, endTimestamp, createBalances }: FetchOptions) {
  const summary: unknown = await httpGet("https://www.blast.fun/api/v1/defillama/fees", {
    params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp },
    // Blast's relay allows 5s for its backend. Allow 10s more for cold starts and transit.
    timeout: 15_000,
    maxRedirects: 0,
  });

  if (
    !isRecord(summary) ||
    summary.start_timestamp !== startTimestamp ||
    summary.end_timestamp !== endTimestamp
  ) {
    throw new Error(`Invalid Blast fee summary for ${startTimestamp}–${endTimestamp}`);
  }

  const dailyFees = toBalances(summary.dailyFees, createBalances);
  const dailyRevenue = toBalances(summary.dailyRevenue, createBalances);
  const dailySupplySideRevenue = toBalances(summary.dailySupplySideRevenue, createBalances);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

/** Convert a published fee breakdown into labeled token balances. */
function toBalances(breakdown: unknown, createBalances: FetchOptions["createBalances"]) {
  if (!isRecord(breakdown)) {
    throw new Error("Invalid Blast fee breakdown");
  }

  const balances = createBalances();
  for (const [source, amounts] of Object.entries(breakdown)) {
    const label = labels.get(source);
    if (!label) {
      throw new Error(`Unrecognized Blast fee source: ${source}`);
    }
    if (!isTokenAmounts(amounts)) {
      throw new Error(`Invalid Blast fee amounts for ${source}`);
    }
    balances.addBalances(amounts, label);
  }
  return balances;
}

/** Check the JSON object shape used for fee breakdowns and token maps. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Check that amounts are exact strings in the smallest token unit. */
function isTokenAmounts(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (amount) => typeof amount === "string" && /^(0|[1-9][0-9]*)$/.test(amount),
    )
  );
}

const feeDescriptions = {
  [launchpadLabels.creation]: "Fees paid to create Blast launches.",
  [launchpadLabels.curve_swaps]: "Fees paid on swaps against Blast bonding curves.",
  [launchpadLabels.migration]: "Fees charged when a launch graduates to an external pool.",
  [launchpadLabels.presale_raise]: "Fees charged on Blast presale proceeds.",
  [frontendLabels.cetus]: "Settled fees paid to Blast on Cetus routes, excluding pool fees.",
  [frontendLabels.aftermath]:
    "Settled fees paid to Blast on Aftermath routes, excluding DEX and DAO fees.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SUI],
  start: "2026-11-07",
  fetch,
  methodology: {
    Fees:
      "Blast launchpad fees and settled frontend fees paid to Blast on Cetus and Aftermath. " +
      "Excludes external DEX fees and vault LP yield.",
    Revenue: "Blast fees after deducting creator and partner shares.",
    ProtocolRevenue: "The portion of launchpad and frontend fees retained by Blast.",
    SupplySideRevenue: "Shares of Blast launchpad fees owed to creators and partners.",
  },
  breakdownMethodology: {
    Fees: feeDescriptions,
    UserFees: feeDescriptions,
    Revenue: feeDescriptions,
    ProtocolRevenue: feeDescriptions,
    SupplySideRevenue: Object.fromEntries(
      Object.values(launchpadLabels).map((label) => [
        label,
        `Creator and partner shares of ${label.toLowerCase()}.`,
      ]),
    ),
  },
};

export default adapter;
