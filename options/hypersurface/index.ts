import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Hypersurface Protocol - DeFi Structured Products Platform
// Website: https://hypersurface.io
// Twitter: https://x.com/hypersurfaceX
// Category: Options

// HedgedPool contract addresses (where Trade events are emitted)
const HEDGED_POOL_ADDRESSES: { [chain: string]: string } = {
  [CHAIN.HYPERLIQUID]: "0x0095aCDD705Cfcc11eAfFb6c19A28C0153ad196F",
  [CHAIN.BASE]: "0x68893915f202e5DA2Ef01493463c50B2f68Df56d",
};

// Trade event ABI from HedgedPool contract
// Premium and fees are in 6 decimals (USDC), notional is in USD
// TradeLeg struct: (int256 amount, int256 premium, uint256 fee, address oToken)
const TRADE_EVENT_ABI =
  "event Trade(address account, address referrer, uint256 totalPremium, uint256 totalFee, uint256 totalNotional, uint256 underlyingPrice, (int256 amount, int256 premium, uint256 fee, address oToken)[] legs)";

// Decimals for premium/fee (USDC = 6 decimals)
const PREMIUM_DECIMALS = 1e6;

const fetch = async (options: FetchOptions) => {
  const hedgedPoolAddress = HEDGED_POOL_ADDRESSES[options.chain];
  if (!hedgedPoolAddress) {
    throw new Error(`No HedgedPool address found for chain: ${options.chain}`);
  }

  // Fetch Trade events directly from blockchain
  const logs = await options.getLogs({
    target: hedgedPoolAddress,
    eventAbi: TRADE_EVENT_ABI,
  });

  // Aggregate volumes from events
  let dailyNotionalVolume = 0;
  let dailyPremiumVolume = 0;
  let dailyFees = 0;

  for (const log of logs) {
    // Event args: account, referrer, totalPremium, totalFee, totalNotional, underlyingPrice, legs
    // All monetary values are stored in 6 decimals (USDC precision)
    const totalPremium = Number(log.totalPremium) / PREMIUM_DECIMALS;
    const totalFee = Number(log.totalFee) / PREMIUM_DECIMALS;
    const totalNotional = Number(log.totalNotional) / PREMIUM_DECIMALS;

    dailyPremiumVolume += totalPremium;
    dailyFees += totalFee;
    dailyNotionalVolume += totalNotional;
  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-09-16", // First trade on HyperEVM
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2025-10-01", // First trade on Base
    },
  },
  methodology: {
    dailyNotionalVolume:
      "Sum of the notional value (in USD) of all options traded on the protocol each day, queried directly from on-chain Trade events.",
    dailyPremiumVolume:
      "Sum of all premiums paid for options traded on the protocol each day, queried directly from on-chain Trade events.",
    dailyFees:
      "Sum of all fees collected by the protocol each day, queried directly from on-chain Trade events.",
  },
};

export default adapter;
