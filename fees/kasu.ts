import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import CoreAssets from "../helpers/coreAssets.json";

// FeeManager contract addresses per chain
const FEE_MANAGER: Record<string, string> = {
  [CHAIN.BASE]: '0xef956C2193e032609da84bEc5E5251B28939b6B9',
  [CHAIN.PLUME]: '0xE1Be322323a412579b4A09fB08ff4bfcA12096B5',
  [CHAIN.XDC]: '0x1e548f62cb33Fb04Ff63CCb11BBe208a7280DC7E',
};

// Stablecoin used per chain (USDC/pUSD - all 6 decimals)
const PAYMENT_TOKEN: Record<string, string> = {
  [CHAIN.BASE]: CoreAssets.base.USDC,
  [CHAIN.PLUME]: CoreAssets.plume_mainnet.pUSD,
  [CHAIN.XDC]: '0xfa2958cb79b0491cc627c1557f441ef849ca8eb1', // USDC on XDC
};

// Emitted by FeeManager when performance fees are distributed
const FeesEmittedEvent = 'event FeesEmitted(address indexed lendingPoolAddress, uint256 ecosystemFeeAmount, uint256 protocolFeeAmount)';

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const token = PAYMENT_TOKEN[options.chain];

  const logs = await options.getLogs({
    target: FEE_MANAGER[options.chain],
    eventAbi: FeesEmittedEvent,
  });

  for (const log of logs) {
    const ecosystemFee = log.ecosystemFeeAmount;
    const protocolFee = log.protocolFeeAmount;

    // Total fees = ecosystem + protocol share of performance fees
    dailyFees.add(token, ecosystemFee, METRIC.PERFORMANCE_FEES);
    dailyFees.add(token, protocolFee, METRIC.PERFORMANCE_FEES);

    // Protocol revenue = protocol's share
    dailyRevenue.add(token, protocolFee, METRIC.PERFORMANCE_FEES);

    // Holders revenue = ecosystem fees distributed to KSU lockers
    dailyHoldersRevenue.add(token, ecosystemFee, METRIC.PERFORMANCE_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Performance fees taken from lending pool interest accruals. A percentage of interest earned by lenders is collected as fees.",
  UserFees: "Same as Fees - borrowers pay interest, of which a performance fee is deducted.",
  Revenue: "Protocol's share of performance fees, sent to the protocol fee receiver.",
  ProtocolRevenue: "Same as Revenue.",
  HoldersRevenue: "Ecosystem share of performance fees, distributed to KASU token lockers (rKASU holders).",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2024-06-06',
    },
    [CHAIN.PLUME]: {
      fetch,
      start: '2025-10-01',
    },
    [CHAIN.XDC]: {
      fetch,
      start: '2025-02-06',
    },
  },
  methodology,
};

export default adapter;
