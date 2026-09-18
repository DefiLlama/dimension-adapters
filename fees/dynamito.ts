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
  const b = data.breakdown || {};
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Fees paid by traders and graduating tokens
  dailyFees.addCGToken("solana", Number(b.swapFeesSol || 0), METRIC.SWAP_FEES);
  dailyFees.addCGToken("solana", Number(b.antiSnipeFeesSol || 0), LABEL.AntiSnipe);
  dailyFees.addCGToken("solana", Number(b.blastOffFeesSol || 0), LABEL.BlastOff);

  // Kept by Dynamito
  dailyRevenue.addCGToken("solana", Number(data.revenueTradeSol || 0), METRIC.SWAP_FEES);
  dailyRevenue.addCGToken("solana", Number(data.revenueBlastSol || 0), LABEL.BlastOff);
  dailyProtocolRevenue.addCGToken("solana", Number(data.revenueTradeSol || 0), METRIC.SWAP_FEES);
  dailyProtocolRevenue.addCGToken("solana", Number(data.revenueBlastSol || 0), LABEL.BlastOff);

  // Paid out to creators and to the Meteora protocol
  dailySupplySideRevenue.addCGToken("solana", Number(data.creatorTradeSol || 0), METRIC.CREATOR_FEES);
  dailySupplySideRevenue.addCGToken("solana", Number(data.creatorBlastSol || 0), LABEL.BlastOff);
  dailySupplySideRevenue.addCGToken("solana", Number(data.meteoraSol || 0), LABEL.Meteora);

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
    [METRIC.SWAP_FEES]: "Same as Revenue: 40% of trade fees kept by Dynamito (half of it funds weekly $TNT buybacks).",
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
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue: "40% of trade fees and 50% of blast-off fees paid to creators, plus the 20% of trade fees paid to the Meteora protocol.",
  },
};

export default adapter;
