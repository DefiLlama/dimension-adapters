import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Sui mainnet launchpad package 0x9c2cef371c0e80648136f7ae65378ac9476e3fdb860538d00290e6e4f975b192
// Sui mainnet presale package 0x1f44a8e9fab4380228fe9c1bcc27d99b7f6ea76a8e18b5c178ca18cd46fb33c4
// Deployment record https://github.com/interest-protocol/blast-v2-contracts/blob/main/deployments/sui/mainnet/2026-11-06-canonical-launch-stack.json
// Cetus router package 0xffd4058af7d6f6d66c335930cced8c91e38ec943e2392232aee27e8127e684e9
// Aftermath DAO swap package 0x5ad6890968efcf3d20899e0cec735214f1067b96e77e77d86408989998468bb2
// Frontend fee recipients
// 0x818d6d7026632f82367a9ca2413a5bb28aeec2a1b8dedca919ef812577b4d0a2
// 0x9420f27f4c8b33563eade002658e4c6dbe9437bd5ae1bececd61f8e91dc2c951
// Checkpoint-scoped frontend_fee_policy https://www.blast.fun/api/v1/defillama/metrics?date=2026-11-21
const dailyFeesUrl = "https://www.blast.fun/api/v1/defillama/fees";

const launchpadLabels = {
  creation: "Launch creation fees",
  curve_swaps: "Bonding curve swap fees",
  migration: "Launch migration fees",
  presale_raise: "Presale raise fees",
} as const;

const frontendLabels = {
  cetus: "Cetus route frontend fees",
  aftermath: "Aftermath route frontend fees",
} as const;

const feeLabels = new Map(Object.entries({ ...launchpadLabels, ...frontendLabels }));
const revenue = withRecipient(feeLabels, "Blast", (label) => `Blast's retained share of ${label}.`);
const supplySideRevenue = withRecipient(
  Object.entries(launchpadLabels),
  "creators and partners",
  (label) => `Creator and partner shares of ${label}.`,
);

/** Build both the labels and methodology for a fee recipient. */
function withRecipient(
  sourceLabels: Iterable<[string, string]>,
  recipient: string,
  describe: (label: string) => string,
) {
  const labels = new Map<string, string>();
  const methodology: Record<string, string> = {};
  for (const [source, feeLabel] of sourceLabels) {
    const label = `${feeLabel} to ${recipient}`;
    labels.set(source, label);
    methodology[label] = describe(feeLabel.toLowerCase());
  }
  return { labels, methodology };
}

/** Read Blast's published fees and revenue for the requested UTC day. */
async function fetch({ dateString, createBalances }: FetchOptions) {
  const summary: unknown = await httpGet(dailyFeesUrl, {
    params: { date: dateString },
    // Blast's relay allows 5s for its backend. Allow 10s more for cold starts and transit.
    timeout: 15_000,
    maxRedirects: 0,
  });

  if (!isRecord(summary) || summary.date !== dateString) {
    throw new Error(`Invalid Blast fee summary for ${dateString}`);
  }

  const { balances: dailyFees } = readBreakdown(summary.dailyFees, feeLabels, createBalances);
  const retained = readBreakdown(summary.dailyRevenue, revenue.labels, createBalances, true);
  const supplySide = readBreakdown(
    summary.dailySupplySideRevenue,
    supplySideRevenue.labels,
    createBalances,
    true,
  );

  const gross = { dailyFees, dailyUserFees: dailyFees.clone() };
  // Omitting only dailyRevenue would let the runner infer it from possibly
  // incomplete supply-side revenue. Keep all three attribution metrics absent.
  if (!retained.complete || !supplySide.complete) return gross;

  return {
    ...gross,
    dailyRevenue: retained.balances,
    dailyProtocolRevenue: retained.balances.clone(),
    dailySupplySideRevenue: supplySide.balances,
  };
}

/** Convert a published fee breakdown into labeled token balances. */
function readBreakdown(
  breakdown: unknown,
  labels: ReadonlyMap<string, string>,
  createBalances: FetchOptions["createBalances"],
  allowUnknown = false,
) {
  if (!isRecord(breakdown)) {
    throw new Error("Invalid Blast fee breakdown");
  }

  const balances = createBalances();
  let complete = true;
  for (const [source, amounts] of Object.entries(breakdown)) {
    const label = labels.get(source);
    if (!label) {
      throw new Error(`Unrecognized Blast fee source: ${source}`);
    }
    if (!isRecord(amounts)) throw new Error(`Invalid Blast fee amounts for ${source}`);
    const known: [string, string][] = [];
    for (const [token, amount] of Object.entries(amounts)) {
      if (amount === null && allowUnknown) {
        complete = false;
      } else if (typeof amount === "string" && /^(0|[1-9][0-9]*)$/.test(amount)) {
        known.push([token, amount]);
      } else {
        throw new Error(`Invalid Blast fee amount for ${source}: ${token}`);
      }
    }
    balances.addBalances(Object.fromEntries(known), label);
  }
  return { balances, complete };
}

/** Check the JSON object shape used for fee breakdowns and token maps. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  // Blast publishes completed UTC days. Its hourly feed accepts only UTC-hour-aligned windows.
  version: 1,
  // Gross fees can be final before deferred partner allocation is known.
  skipBreakdownValidation: true,
  chains: [CHAIN.SUI],
  start: "2026-11-07",
  fetch,
  methodology: {
    Fees:
      "Blast launchpad fees and settled frontend fees paid to Blast on Cetus and Aftermath. " +
      "Excludes external DEX fees and vault LP yield.",
    UserFees: "Launchpad fees and frontend route fees paid by Blast users.",
    Revenue: "Blast fees after deducting creator and partner shares. The fee split is omitted until attribution is complete.",
    ProtocolRevenue: "The portion of launchpad and frontend fees retained by Blast.",
    SupplySideRevenue: "Shares of Blast launchpad fees owed to creators and partners.",
  },
  breakdownMethodology: {
    Fees: feeDescriptions,
    UserFees: feeDescriptions,
    Revenue: revenue.methodology,
    ProtocolRevenue: revenue.methodology,
    SupplySideRevenue: supplySideRevenue.methodology,
  },
};

export default adapter;
