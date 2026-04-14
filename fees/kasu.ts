import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import CoreAssets from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

type Deployment = {
  feeManager: string;
  systemVariables: string;
  paymentToken: string;
};

// One chain may have multiple independent deployments (different stablecoins).
const DEPLOYMENTS: Record<string, Deployment[]> = {
  [CHAIN.BASE]: [
    {
      feeManager: '0xef956C2193e032609da84bEc5E5251B28939b6B9',
      systemVariables: '0x193Bb02A24F5562b58fEB86550e6f09Bb6c41f69',
      paymentToken: CoreAssets.base.USDC,
    },
  ],
  [CHAIN.PLUME]: [
    {
      feeManager: '0xE1Be322323a412579b4A09fB08ff4bfcA12096B5',
      systemVariables: '0xb82992c13AdeE67F43758bce6FF16E32c0Ca4DC6',
      paymentToken: CoreAssets.plume_mainnet.pUSD,
    },
  ],
  [CHAIN.XDC]: [
    {
      // AUDD deployment
      feeManager: '0x1e548f62cb33Fb04Ff63CCb11BBe208a7280DC7E',
      systemVariables: '0x34d17c9DD1f31Fb34757DE923EC083601d0eDFFe',
      paymentToken: '0x9fe4e6321eeb7c4bc537570f015e4734b15002b8', // AUDD
    },
    {
      // USDC deployment
      feeManager: '0x10Ed8d3668826293935Ab5C7d4Df86cdc2D124B3',
      systemVariables: '0xb73Ebe67c8597d55A5F4FCc2C1638eDd5512BfBb',
      paymentToken: '0xfa2958cb79b0491cc627c1557f441ef849ca8eb1', // USDC
    },
  ],
};

// FULL_PERCENT denominator used in SystemVariables (100% = 10_000)
const FULL_PERCENT = 10_000n;

// Emitted by FeeManager when performance fees are distributed.
// `amount` passed to emitFees() is already the performance-fee portion of gross interest.
const FeesEmittedEvent = 'event FeesEmitted(address indexed lendingPoolAddress, uint256 ecosystemFeeAmount, uint256 protocolFeeAmount)';

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const deployments = DEPLOYMENTS[options.chain];

  await Promise.all(deployments.map(async (deployment) => {
    const { feeManager, systemVariables, paymentToken } = deployment;

    const performanceFee = BigInt(await options.api.call({
      target: systemVariables,
      abi: 'uint256:performanceFee',
    }));

    const logs = await options.getLogs({
      target: feeManager,
      eventAbi: FeesEmittedEvent,
    });

    for (const log of logs) {
      const ecosystemFee = BigInt(log.ecosystemFeeAmount);
      const protocolFee = BigInt(log.protocolFeeAmount);
      const totalFee = ecosystemFee + protocolFee;

      // Back-calculate supply-side share from the performance fee:
      //   totalFee = grossInterest * performanceFee / FULL_PERCENT
      //   supplySide = grossInterest - totalFee = totalFee * (FULL_PERCENT - performanceFee) / performanceFee
      const supplySide = performanceFee > 0n
        ? totalFee * (FULL_PERCENT - performanceFee) / performanceFee
        : 0n;

      dailyFees.add(paymentToken, totalFee, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(paymentToken, protocolFee, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(paymentToken, ecosystemFee, "Ecosystem fees");
      dailyProtocolRevenue.add(paymentToken, protocolFee, METRIC.PERFORMANCE_FEES);
      dailyHoldersRevenue.add(paymentToken, ecosystemFee, "Ecosystem fees");
      dailySupplySideRevenue.add(paymentToken, supplySide, METRIC.BORROW_INTEREST);
    }
  }));

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
  Fees: "Performance fees collected from lending pool interest accruals (the protocol's cut of gross interest paid by borrowers).",
  UserFees: "Same as Fees.",
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
  breakdownMethodology: {
    Fees: {
      [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol from borrower interest",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "The protocol collects a portion of the interest as a performance fee",
      "Ecosystem fees": "The protocol shares a portion of the interest with rKSU holders",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "The protocol collects a portion of the interest as a performance fee",
    },
    HoldersRevenue: {
      "Ecosystem fees": "The protocol shares a portion of the interest with rKSU holders",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Interest earned by lenders after performance fees are deducted",
    },
  },
};

export default adapter;