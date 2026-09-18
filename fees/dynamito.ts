import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Dynamito (dynamito.fun): token launchpad on Solana built on Meteora's Dynamic Bonding Curve.
// Every buy/sell on a curve pays a fee (1% standard; 2% or 3% if the creator picked a higher tier),
// split 40% creator / 40% Dynamito / 20% Meteora protocol. Daily totals are served by the platform's
// public endpoint, aggregated from indexed on-chain trades of Dynamito pools.
const API = "https://dynamito.fun/api/llama";

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(`${API}?start=${options.startTimestamp}&end=${options.endTimestamp}`);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addCGToken("solana", Number(data.feesSol || 0));
  dailyRevenue.addCGToken("solana", Number(data.revenueSol || 0));
  dailySupplySideRevenue.addCGToken("solana", Number(data.creatorSol || 0));
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-17",
  pullHourly: true,
  methodology: {
    Fees: "Bonding-curve trade fees paid by traders on every buy and sell of Dynamito tokens (1% standard, 2% or 3% on higher-fee tiers). Anti-snipe surcharge (first 5 seconds after launch) and the 3% blast-off fee are excluded, so figures are conservative.",
    Revenue: "40% of trade fees kept by Dynamito. 50% of this revenue funds weekly $TNT buybacks (the Fuse Fund).",
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue: "40% of trade fees paid to token creators, claimable on-chain.",
  },
};

export default adapter;
