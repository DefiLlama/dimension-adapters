import { settlements, tierBps } from "./settlements";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { treasuryBuybacks } from "./buybacks";

// Guanaco publishes confirmed pool swaps through the same indexer used by its DEX volume adapter.
const indexer = "https://api.guanaco.fi/v1";
const satoshisPerBch = 100_000_000;
const labels = tierBps.map(bps => `Swap Fees (${bps / 100}% Tier)`);
const lpLabel = "Swap Fees To Liquidity Providers";
const revenueLabel = "Swap Fees Allocated To GUA Buybacks";
const dustLabel = "Treasury Output Dust Top-Ups";
const burnLabel = "GUA Treasury Buybacks";

async function fetch({ startTimestamp, endTimestamp, createBalances }: FetchOptions) {
  const { fees, revenue, dust } = await settlements(indexer, startTimestamp, endTimestamp);
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  let total = 0n;
  for (const [bps, fee] of fees) {
    total += fee;
    if (fee) dailyFees.addCGToken("bitcoin-cash", Number(fee) / satoshisPerBch, labels[tierBps.indexOf(bps)]);
  }
  if (total > revenue + dust) dailySupplySideRevenue.addCGToken("bitcoin-cash", Number(total - revenue - dust) / satoshisPerBch, lpLabel);
  if (revenue) dailyRevenue.addCGToken("bitcoin-cash", Number(revenue) / satoshisPerBch, revenueLabel);

  if (dust) dailyRevenue.addCGToken("bitcoin-cash", Number(dust) / satoshisPerBch, dustLabel);

  const spentSats = await treasuryBuybacks(indexer, startTimestamp, endTimestamp);
  if (spentSats > 0n) dailyHoldersRevenue.addCGToken("bitcoin-cash", Number(spentSats) / satoshisPerBch, burnLabel);
  return { dailyFees, dailyUserFees: dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: 0, dailyHoldersRevenue };
}

const methodology = {
  Fees: "Covenant swap charges computed separately for each confirmed pool input in integer satoshis. Includes observed dust top-ups paid into dedicated treasury outputs.",
  UserFees: "Swap charges verified against the pool and treasury outputs.",
  SupplySideRevenue: "Per-swap contract fee less the integer treasury allocation, verified against the pool invariant.",
  Revenue: "BCH received in dedicated treasury outputs, broken down into the rounded covenant allocation and observed dust top-ups.",
  HoldersRevenue: "BCH paid by the treasury into the project GUA pool, measured from confirmed input and output reserves in the purchase window using block-inclusive median time. Subsequent GUA burns are tracked at https://guanaco.fi/gua.",
};
const breakdownMethodology = {
  Fees: Object.fromEntries(labels.map((label, tier) => [label, `Verified on-chain swap charges in the ${tierBps[tier] / 100}% covenant tier.`])),
  UserFees: Object.fromEntries(labels.map(label => [label, "Verified swap charges paid by traders in this tier."])),
  SupplySideRevenue: { [lpLabel]: methodology.SupplySideRevenue },
  Revenue: { [revenueLabel]: "BCH allocated to GUA buybacks by each swap covenant.", [dustLabel]: "Additional satoshis received when the dedicated treasury output is funded to 546 satoshis." },
  HoldersRevenue: { [burnLabel]: methodology.HoldersRevenue },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BITCOIN_CASH],
  start: "2026-09-06",
  fetch,
  methodology,
  breakdownMethodology,
};
export default adapter;
