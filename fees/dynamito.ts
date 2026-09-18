import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

// Dynamito (dynamito.fun): token launchpad on Solana built on Meteora's Dynamic Bonding Curve program
// (dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN). Every buy/sell on a curve pays a trade fee
// (1% standard; 2% or 3% if the creator picked a higher tier) plus an anti-snipe surcharge in the first
// 5 seconds after launch; graduation ("blast-off") at 85 SOL charges a 3% fee on the pot.
// Trade fees are split 40% creator / 40% Dynamito / 20% Meteora protocol; the blast-off fee 50% creator / 50% Dynamito.
// Daily totals are served by the platform's public endpoint, aggregated from indexed on-chain trades of Dynamito pools.
const API = "https://dynamito.fun/api/llama";

const LABEL = {
  AntiSnipe: "Anti-snipe Fees",
  BlastOff: "Blast-off Fees",
  Meteora: "Meteora Protocol Fees",
};

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(`${API}?start=${options.startTimestamp}&end=${options.endTimestamp}`);
  // Reject incomplete responses instead of silently recording zeros
  if (!data || data.error) throw new Error(`Dynamito API error: ${data?.error || "empty response"}`);
  const b = data.breakdown;
  const gerekli = ["revenueTradeSol", "revenueBlastSol", "creatorTradeSol", "creatorBlastSol", "meteoraSol"];
  const gerekliBreakdown = ["swapFeesSol", "antiSnipeFeesSol", "blastOffFeesSol"];
  if (!b || gerekliBreakdown.some((k) => typeof b[k] !== "number") || gerekli.some((k) => typeof data[k] !== "number")) {
    throw new Error("Dynamito API response is missing required fee fields");
  }
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Fees paid by traders and graduating tokens
  dailyFees.addCGToken("solana", b.swapFeesSol, METRIC.SWAP_FEES);
  dailyFees.addCGToken("solana", b.antiSnipeFeesSol, LABEL.AntiSnipe);
  dailyFees.addCGToken("solana", b.blastOffFeesSol, LABEL.BlastOff);

  // Kept by Dynamito
  dailyRevenue.addCGToken("solana", data.revenueTradeSol, METRIC.SWAP_FEES);
  dailyRevenue.addCGToken("solana", data.revenueBlastSol, LABEL.BlastOff);
  dailyProtocolRevenue.addCGToken("solana", data.revenueTradeSol, METRIC.SWAP_FEES);
  dailyProtocolRevenue.addCGToken("solana", data.revenueBlastSol, LABEL.BlastOff);

  // Paid out to creators and to the Meteora protocol
  dailySupplySideRevenue.addCGToken("solana", data.creatorTradeSol, METRIC.CREATOR_FEES);
  dailySupplySideRevenue.addCGToken("solana", data.creatorBlastSol, LABEL.BlastOff);
  dailySupplySideRevenue.addCGToken("solana", data.meteoraSol, LABEL.Meteora);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Bonding-curve trade fees paid by traders on every buy and sell (1% standard, 2% or 3% on higher-fee tiers chosen by the creator).",
    [LABEL.AntiSnipe]: "Extra fee paid by buyers in the first 5 seconds after a launch (99% decaying to the base tier, on-chain fee schedule).",
    [LABEL.BlastOff]: "3% fee on the 85 SOL pot when a token graduates from the curve to the open market.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "40% of trade fees (including the anti-snipe surcharge) kept by Dynamito.",
    [LABEL.BlastOff]: "50% of the blast-off fee kept by Dynamito.",
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: "Same as Revenue: 40% of trade fees kept by Dynamito treasury.",
    [LABEL.BlastOff]: "50% of the blast-off fee kept by Dynamito.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "40% of trade fees paid to token creators, claimable on-chain.",
    [LABEL.BlastOff]: "50% of the blast-off fee paid to the token creator.",
    [LABEL.Meteora]: "20% of trade fees paid to the Meteora protocol that runs the curve.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-17",
  pullHourly: true,
  breakdownMethodology,
  methodology: {
    Fees: "Trade fees on every buy/sell of Dynamito tokens (1-3% tier plus the anti-snipe surcharge in the first 5 seconds) and the 3% blast-off fee at graduation.",
    Revenue: "40% of trade fees plus 50% of blast-off fees, kept by Dynamito.",
    ProtocolRevenue: "Same as Revenue: all of it is kept by the Dynamito treasury. No token holder distribution yet; when the $TNT buyback programme starts, its share will be reported as HoldersRevenue.",
    SupplySideRevenue: "40% of trade fees and 50% of blast-off fees paid to creators, plus the 20% of trade fees paid to the Meteora protocol.",
  },
};

export default adapter;
