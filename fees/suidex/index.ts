import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * SuiDex — swap fees and how they are split.
 *
 * Both generations of the protocol take a cut of swap fees and pass the rest to
 * liquidity providers, but they do it differently, so the endpoint weights them
 * separately rather than applying one blended ratio:
 *
 *   V3 (concentrated liquidity) — the protocol's share is stored PER POOL and is
 *   adjustable, so it is read from each pool and that pool's fees weighted by it.
 *   Most pools sit at 20%; they are not all the same. That share is paid to the
 *   team and is not contractually directed to holders.
 *
 *   V2 (constant-product AMM) — a flat 0.30% fee split 0.15 to LPs, 0.09 to the
 *   team, 0.03 to VICTORY lockers and 0.03 to buyback. So 50% supply-side, 30%
 *   team, and 20% to token holders (lockers and buyback, equal). The summary
 *   reports lockers and buyback as one holders figure; they are split in half
 *   here because the pair contract assigns them the same 3 bps
 *   (Suidex-V2 pair.move: TOTAL_FEE 30, TEAM 9, LOCKER 3, BUYBACK 3 of 10000).
 */
const SUIDEX_API = "https://dex.suidex.org/api/defillama/summary";

const V2_SWAP_FEES = "V2 Swap Fees";
const V3_SWAP_FEES = "V3 Swap Fees";
const V2_SWAP_FEES_TO_LPS = "V2 Swap Fees To LPs";
const V3_SWAP_FEES_TO_LPS = "V3 Swap Fees To LPs";
const V3_SWAP_FEES_TO_PROTOCOL = "V3 Swap Fees To Protocol";
const V2_SWAP_FEES_TO_TEAM = "V2 Swap Fees To Team";
const V2_SWAP_FEES_TO_LOCKERS = "V2 Swap Fees To VICTORY Lockers";
const V2_SWAP_FEES_TO_BUYBACK = "V2 Swap Fees To Buyback";

interface GenerationFees {
  feesUsd: number;
  supplySideRevenueUsd: number;
  protocolRevenueUsd: number;
  holdersRevenueUsd?: number;
  complete?: boolean;
}

interface SuidexSummary {
  feesUsd: number;
  supplySideRevenueUsd: number;
  protocolRevenueUsd: number;
  holdersRevenueUsd: number;
  complete: boolean;
  coverage?: { v3DataFrom: string | null; windowFullyCovered: boolean };
  breakdown?: { v2?: GenerationFees; v3?: GenerationFees };
}

function requireUsd(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SuiDex: missing ${name}`);
  }
  return value;
}

const fetch = async (options: FetchOptions) => {
  const url = `${SUIDEX_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const res: SuidexSummary = await fetchURL(url);

  // See the volume adapter: V3 swap history is pruned at 90 days, so an older
  // window can only be answered from V2. Refuse it rather than publish a figure
  // that looks complete and is not.
  if (!res || res.complete !== true || !res.breakdown?.v2 || !res.breakdown?.v3) {
    throw new Error(
      `SuiDex: incomplete data for ${options.startTimestamp}-${options.endTimestamp}` +
      (res?.coverage?.v3DataFrom ? ` (V3 history starts ${res.coverage.v3DataFrom})` : ""),
    );
  }

  const v2 = res.breakdown.v2;
  const v3 = res.breakdown.v3;
  if (v2.complete === false || v3.complete === false) {
    throw new Error(`SuiDex: incomplete generation data for ${options.startTimestamp}-${options.endTimestamp}`);
  }
  if (v3.holdersRevenueUsd) {
    throw new Error("SuiDex: V3 reported holders revenue, which this split does not record");
  }

  const v2Supply = requireUsd("v2 supply-side revenue", v2.supplySideRevenueUsd);
  const v2Protocol = requireUsd("v2 protocol revenue", v2.protocolRevenueUsd);
  const v2Holders = requireUsd("v2 holders revenue", v2.holdersRevenueUsd);
  const v3Supply = requireUsd("v3 supply-side revenue", v3.supplySideRevenueUsd);
  const v3Protocol = requireUsd("v3 protocol revenue", v3.protocolRevenueUsd);

  // V2 protocol revenue from the API is the non-LP half (team + lockers + buyback).
  // Holders revenue is that locker and buyback slice, so the team keeps the rest.
  if (v2Holders > v2Protocol + 0.02) {
    throw new Error("SuiDex: V2 holders revenue exceeds V2 protocol revenue");
  }
  const v2Team = v2Protocol - v2Holders;
  const lockerShare = v2Holders / 2;
  const buybackShare = v2Holders - lockerShare;

  // Generation fee totals are rounded separately from the split, so a window can
  // be off by a cent. Label fees as the sum of the same components that go to
  // supply-side revenue and revenue, which keeps Fees = Revenue + SupplySideRevenue.
  const labeledFees = v2Supply + v2Protocol + v3Supply + v3Protocol;
  const headlineFees = requireUsd("fees", res.feesUsd);
  if (Math.abs(labeledFees - headlineFees) > 1) {
    throw new Error(`SuiDex: fee breakdown does not reconcile with feesUsd (gap ${labeledFees - headlineFees})`);
  }

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(v2Supply + v2Protocol, V2_SWAP_FEES);
  dailyFees.addUSDValue(v3Supply + v3Protocol, V3_SWAP_FEES);

  dailySupplySideRevenue.addUSDValue(v2Supply, V2_SWAP_FEES_TO_LPS);
  dailySupplySideRevenue.addUSDValue(v3Supply, V3_SWAP_FEES_TO_LPS);

  dailyRevenue.addUSDValue(v3Protocol, V3_SWAP_FEES_TO_PROTOCOL);
  dailyRevenue.addUSDValue(v2Team, V2_SWAP_FEES_TO_TEAM);
  dailyRevenue.addUSDValue(lockerShare, V2_SWAP_FEES_TO_LOCKERS);
  dailyRevenue.addUSDValue(buybackShare, V2_SWAP_FEES_TO_BUYBACK);

  dailyProtocolRevenue.addUSDValue(v3Protocol, V3_SWAP_FEES_TO_PROTOCOL);
  dailyProtocolRevenue.addUSDValue(v2Team, V2_SWAP_FEES_TO_TEAM);

  dailyHoldersRevenue.addUSDValue(lockerShare, V2_SWAP_FEES_TO_LOCKERS);
  dailyHoldersRevenue.addUSDValue(buybackShare, V2_SWAP_FEES_TO_BUYBACK);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "All swap fees paid by traders on SuiDex V2 and V3.",
  UserFees: "Swap fees paid by traders.",
  SupplySideRevenue:
    "The share of swap fees kept by liquidity providers — the per-pool remainder " +
    "after the protocol's cut on V3, and 50% of the 0.30% fee on V2.",
  Revenue:
    "The share of swap fees the protocol keeps: a per-pool percentage on V3 " +
    "(commonly 20%), and 50% of the fee on V2 (team, VICTORY lockers and buyback).",
  ProtocolRevenue:
    "The share kept by the team: the whole V3 protocol fee, and 30% of V2 swap fees. " +
    "The V2 locker share and buyback are holders revenue, not protocol revenue.",
  HoldersRevenue:
    "The portion the V2 pair contract directs to VICTORY holders: the lockers' " +
    "revenue share and the buyback, together 20% of V2 swap fees, split equally. " +
    "V3's protocol share is distributed to the team and is not contractually " +
    "directed to holders, so it is protocol revenue only — even though part of " +
    "it is in practice spent buying VICTORY.",
};

const breakdownMethodology = {
  Fees: {
    [V2_SWAP_FEES]: "Swap fees paid by traders on SuiDex V2 (constant-product AMM).",
    [V3_SWAP_FEES]: "Swap fees paid by traders on SuiDex V3 (concentrated liquidity).",
  },
  UserFees: {
    [V2_SWAP_FEES]: "Swap fees paid by traders on SuiDex V2.",
    [V3_SWAP_FEES]: "Swap fees paid by traders on SuiDex V3.",
  },
  SupplySideRevenue: {
    [V2_SWAP_FEES_TO_LPS]: "50% of V2 swap fees kept by liquidity providers (0.15% of the 0.30% fee).",
    [V3_SWAP_FEES_TO_LPS]: "The per-pool remainder of V3 swap fees after the protocol's cut, paid to liquidity providers.",
  },
  Revenue: {
    [V3_SWAP_FEES_TO_PROTOCOL]: "Per-pool V3 protocol fee (commonly 20%), kept by the team.",
    [V2_SWAP_FEES_TO_TEAM]: "30% of V2 swap fees (0.09% of the 0.30% fee) kept by the team.",
    [V2_SWAP_FEES_TO_LOCKERS]: "10% of V2 swap fees (0.03% of the 0.30% fee) directed to VICTORY lockers.",
    [V2_SWAP_FEES_TO_BUYBACK]: "10% of V2 swap fees (0.03% of the 0.30% fee) used to buy back VICTORY.",
  },
  ProtocolRevenue: {
    [V3_SWAP_FEES_TO_PROTOCOL]: "Per-pool V3 protocol fee (commonly 20%), kept by the team.",
    [V2_SWAP_FEES_TO_TEAM]: "30% of V2 swap fees (0.09% of the 0.30% fee) kept by the team.",
  },
  HoldersRevenue: {
    [V2_SWAP_FEES_TO_LOCKERS]: "10% of V2 swap fees paid to VICTORY lockers.",
    [V2_SWAP_FEES_TO_BUYBACK]: "10% of V2 swap fees used to buy back VICTORY.",
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  // V3 swap rows are retained for 90 days and this is where that window began;
  // earlier dates would be V2-only, which the adapter refuses.
  start: "2026-07-05",
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
