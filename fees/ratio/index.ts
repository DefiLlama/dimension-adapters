import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Polygon USDC token and WA fee wallet
const FEE_TOKENS: Record<string, string[]> = {
  [CHAIN.POLYGON]: [
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
  ],
};

const FEE_TARGETS: Record<string, string[]> = {
  [CHAIN.POLYGON]: [
    "0x04F88Cf97d33F1Ec4659e7976607A64A85F05154", // WA fee wallet on Polygon
  ],
};

// 2) CORE FETCH LOGIC: track ERC-20 transfer events into fee addresses
const fetch = async (options: FetchOptions) => {
  const chain = options.chain; // chain key like "ethereum", "arbitrum"
  const tokens = FEE_TOKENS[chain] || [];
  const targets = FEE_TARGETS[chain] || [];

  // If protocol isn't deployed on this chain, return empty balances
  if (!tokens.length || !targets.length) {
    const empty = options.createBalances();
    return {
      dailyFees: empty,
      dailyRevenue: empty,
      // dailyProtocolRevenue: empty,
      // dailySupplySideRevenue: empty,
    };
  }

  // addTokensReceived:
  // - Looks up all ERC-20 Transfer events to `targets`
  //   for `tokens` between startTimestamp and endTimestamp.
  const dailyFees = await addTokensReceived({
    options,
    tokens,
    targets,
  });

  // If ALL received transfers are protocol revenue:
  const dailyRevenue = dailyFees;

  // If you need to split, use something like:
  // const dailyRevenue = options.createBalances();
  // const dailySupplySideRevenue = options.createBalances();
  // dailyRevenue.addBalances(dailyFees, 0.3);        // 30% to protocol
  // dailySupplySideRevenue.addBalances(dailyFees, 0.7); // 70% to LPs

  return {
    dailyFees,
    dailyRevenue,
    // dailyProtocolRevenue: dailyRevenue,
    // dailySupplySideRevenue,
  };
};

// 3) EXPLAIN YOUR METHODOLOGY IN PLAIN ENGLISH
const methodology = {
  Fees:
    "All Polygon USDC transferred into the WA fee wallet during the day is counted as total fees.",
  Revenue:
    "All USDC fees received by the WA wallet are considered protocol revenue.",
  // SupplySideRevenue: "If you split fees with LPs, describe it here.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2023-01-01",                       // earliest reliable date (or unix timestamp as string)
  methodology,
};

export default adapter;