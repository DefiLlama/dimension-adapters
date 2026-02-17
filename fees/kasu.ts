import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import CoreAssets from "../helpers/coreAssets.json";

// FeeManager contract addresses per chain
const FEE_MANAGER: Record<string, string> = {
  [CHAIN.BASE]: '0xef956C2193e032609da84bEc5E5251B28939b6B9',
  [CHAIN.PLUME]: '0xE1Be322323a412579b4A09fB08ff4bfcA12096B5',
  [CHAIN.XDC]: '0x1e548f62cb33Fb04Ff63CCb11BBe208a7280DC7E',
};

// SystemVariables contract addresses per chain (holds the configurable performanceFee)
const SYSTEM_VARIABLES: Record<string, string> = {
  [CHAIN.BASE]: '0x193Bb02A24F5562b58fEB86550e6f09Bb6c41f69',
  [CHAIN.PLUME]: '0xb82992c13AdeE67F43758bce6FF16E32c0Ca4DC6',
  [CHAIN.XDC]: '0x34d17c9DD1f31Fb34757DE923EC083601d0eDFFe',
};

// Stablecoin used per chain (USDC/pUSD - all 6 decimals)
const PAYMENT_TOKEN: Record<string, string> = {
  [CHAIN.BASE]: CoreAssets.base.USDC,
  [CHAIN.PLUME]: CoreAssets.plume_mainnet.pUSD,
  [CHAIN.XDC]: CoreAssets.xdc["USDC.e"],
};

// FULL_PERCENT denominator used in SystemVariables (100% = 10_000)
const FULL_PERCENT = 10_000n;

// Emitted by FeeManager when performance fees are distributed
const FeesEmittedEvent = 'event FeesEmitted(address indexed lendingPoolAddress, uint256 ecosystemFeeAmount, uint256 protocolFeeAmount)';

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const token = PAYMENT_TOKEN[options.chain];

  // Read the current performance fee rate (e.g. 1000 = 10% of gross interest)
  const performanceFee = BigInt(await options.api.call({
    target: SYSTEM_VARIABLES[options.chain],
    abi: 'uint256:performanceFee',
  }));

  const logs = await options.getLogs({
    target: FEE_MANAGER[options.chain],
    eventAbi: FeesEmittedEvent,
  });

  for (const log of logs) {
    const ecosystemFee = log.ecosystemFeeAmount;
    const protocolFee = log.protocolFeeAmount;
    const totalFee = BigInt(ecosystemFee) + BigInt(protocolFee);

    // Back-calculate gross interest earned by lenders:
    //   totalFee = grossInterest * performanceFee / FULL_PERCENT
    //   supplySide = grossInterest - totalFee = totalFee * (FULL_PERCENT - performanceFee) / performanceFee
    const supplySide = performanceFee > 0n
      ? totalFee * (FULL_PERCENT - performanceFee) / performanceFee
      : 0n;

    dailyFees.add(token, ecosystemFee);
    dailyFees.add(token, protocolFee);
    dailyRevenue.add(token, protocolFee);
    dailyHoldersRevenue.add(token, ecosystemFee);
    dailySupplySideRevenue.add(token, supplySide);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Performance fees taken from lending pool interest accruals. A percentage of gross interest earned by lenders is collected as fees.",
  UserFees: "Same as Fees - borrowers pay interest, of which a performance fee is deducted.",
  Revenue: "Protocol's share of performance fees, sent to the protocol fee receiver.",
  ProtocolRevenue: "Same as Revenue.",
  HoldersRevenue: "Ecosystem share of performance fees, distributed to KSU token lockers (rKSU holders).",
  SupplySideRevenue: "Interest earned by lenders after performance fees are deducted.",
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
