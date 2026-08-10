import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import CoreAssets from "../helpers/coreAssets.json";
import { getBlock } from "../helpers/getBlock";
import { METRIC } from "../helpers/metrics";

type Deployment = {
  lendingPoolFactory: string;
  systemVariables: string;
  paymentToken: string;
  factoryStartBlock: number;
};

// All Kasu deployments align to the same initial epoch (Thu, 13 Jun 2024 06:00:00 UTC).
const INITIAL_EPOCH_START_TIMESTAMP = 1718258400;
const EPOCH_DURATION_SEC = 7 * 24 * 3600;

// Look back this many epochs when computing attribution — clearing is typically
// weekly but may be delayed, so overshoot a bit.
const LOOKBACK_EPOCHS = 3;

// One chain may have multiple independent deployments (different stablecoins).
const DEPLOYMENTS: Record<string, Deployment[]> = {
  [CHAIN.BASE]: [
    {
      lendingPoolFactory: '0xd8c77e8882f9BAda35804625e8264E51cb905190',
      systemVariables: '0x193Bb02A24F5562b58fEB86550e6f09Bb6c41f69',
      paymentToken: CoreAssets.base.USDC,
      factoryStartBlock: 15486216,
    },
  ],
  [CHAIN.PLUME]: [
    {
      lendingPoolFactory: '0xA2e9992B73BE340eC7134e751A4E5358374Fb1d0',
      systemVariables: '0xb82992c13AdeE67F43758bce6FF16E32c0Ca4DC6',
      paymentToken: CoreAssets.plume_mainnet.pUSD,
      factoryStartBlock: 763533,
    },
  ],
  [CHAIN.XDC]: [
    {
      // AUDD deployment
      lendingPoolFactory: '0x57ae27421a28999Ea5679b9a7EaC4183e78fd503',
      systemVariables: '0x34d17c9DD1f31Fb34757DE923EC083601d0eDFFe',
      paymentToken: '0x9fe4e6321eeb7c4bc537570f015e4734b15002b8', // AUDD
      factoryStartBlock: 98794585,
    },
    {
      // USDC deployment
      lendingPoolFactory: '0x8bFe5508B61b46ACB1c141eB4C04e11515F5A618',
      systemVariables: '0xb73Ebe67c8597d55A5F4FCc2C1638eDd5512BfBb',
      paymentToken: '0xfa2958cb79b0491cc627c1557f441ef849ca8eb1', // USDC
      factoryStartBlock: 101326758,
    },
  ],
};

// FULL_PERCENT denominator used in SystemVariables (100% = 10_000)
const FULL_PERCENT = 10_000n;

// Emitted by LendingPoolFactory when a pool is created. Full signature is required
// so the topic hash matches the on-chain event — struct layouts cannot be shortened.
const PoolCreatedEvent = 'event PoolCreated(address indexed lendingPool, tuple(address lendingPool, address pendingPool, address[] tranches) lendingPoolDeployment, tuple(tuple(uint256 ratio, uint256 interestRate, uint256 minDepositAmount, uint256 maxDepositAmount)[] tranches, address drawRecipient, uint256 desiredDrawAmount, uint256 trancheInterestChangeEpochDelay, uint256 targetExcessLiquidityPercentage, uint256 minimumExcessLiquidityPercentage) poolConfiguration)';

// Emitted by each LendingPool when per-epoch interest is applied at clearing.
// `feesIncreasedAmount` is the performance-fee portion of the interest that accrued
// during the given `epoch`.
const FeesOwedIncreasedEvent = 'event FeesOwedIncreased(uint256 indexed epoch, uint256 feesIncreasedAmount)';

// Emitted by SystemVariables when rate configuration changes. Used to look up
// the historically-correct rate for each FeesOwedIncreased log.
const PerformanceFeeUpdatedEvent = 'event PerformanceFeeUpdated(uint256 performanceFee)';
const FeeRatesUpdatedEvent = 'event FeeRatesUpdated(uint256 ecosystemFeeRate, uint256 protocolFeeRate)';

// Resolve a rate value that was active at a given block from a list of
// rate-change events. Events must already be sorted ascending by blockNumber.
const rateAtBlock = (
  events: { blockNumber: number; value: bigint }[],
  fallback: bigint,
  blockNumber: number,
): bigint => {
  let value = fallback;
  for (const evt of events) {
    if (evt.blockNumber > blockNumber) break;
    value = evt.value;
  }
  return value;
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const deployments = DEPLOYMENTS[options.chain];
  const windowStart = options.fromTimestamp;
  const windowEnd = options.toTimestamp;
  const lookbackStart = windowStart - LOOKBACK_EPOCHS * EPOCH_DURATION_SEC;

  await Promise.all(deployments.map(async (deployment) => {
    const { lendingPoolFactory, systemVariables, paymentToken, factoryStartBlock } = deployment;

    // 1. Discover pools (cached across runs since PoolCreated is historical).
    const poolLogs = await options.getLogs({
      target: lendingPoolFactory,
      eventAbi: PoolCreatedEvent,
      fromBlock: factoryStartBlock,
      cacheInCloud: true,
    });
    const pools: string[] = poolLogs.map((log: any) => log.lendingPool);
    if (pools.length === 0) return;

    // 2. Read current rate configuration as fallback + rate-change history so
    // historical events can be priced with the rate that was active at their
    // block (performanceFee and feeRates are mutable post-deployment).
    const lookbackFromBlock = await getBlock(lookbackStart, options.chain);

    const [currentPerformanceFee, currentFeeRates, perfFeeUpdateLogs, feeRatesUpdateLogs] = await Promise.all([
      options.api.call({
        target: systemVariables,
        abi: 'uint256:performanceFee',
      }).then(BigInt),
      options.api.call({
        target: systemVariables,
        abi: 'function feeRates() view returns (uint256 ecosystemFeeRate, uint256 protocolFeeRate)',
      }),
      options.getLogs({
        target: systemVariables,
        eventAbi: PerformanceFeeUpdatedEvent,
        fromBlock: factoryStartBlock,
        cacheInCloud: true,
      }),
      options.getLogs({
        target: systemVariables,
        eventAbi: FeeRatesUpdatedEvent,
        fromBlock: factoryStartBlock,
        cacheInCloud: true,
      }),
    ]);

    const perfFeeHistory = perfFeeUpdateLogs
      .map((log: any) => ({ blockNumber: Number(log.blockNumber), value: BigInt(log.performanceFee) }))
      .sort((a: any, b: any) => a.blockNumber - b.blockNumber);
    const ecosystemRateHistory = feeRatesUpdateLogs
      .map((log: any) => ({ blockNumber: Number(log.blockNumber), value: BigInt(log.ecosystemFeeRate) }))
      .sort((a: any, b: any) => a.blockNumber - b.blockNumber);

    const currentEcosystemRate = BigInt(currentFeeRates.ecosystemFeeRate ?? currentFeeRates[0]);

    // 3. Fetch FeesOwedIncreased logs across the lookback window (3 epochs back).
    // Each log represents one epoch's worth of interest, which we spread evenly
    // across the epoch and attribute the overlap with [windowStart, windowEnd].
    const feeLogs = await options.getLogs({
      targets: pools,
      eventAbi: FeesOwedIncreasedEvent,
      fromBlock: lookbackFromBlock,
    });

    for (const log of feeLogs) {
      const epoch = Number(log.epoch);
      const feesAmount = BigInt(log.feesIncreasedAmount);
      if (feesAmount === 0n) continue;

      const epochStart = INITIAL_EPOCH_START_TIMESTAMP + epoch * EPOCH_DURATION_SEC;
      const epochEnd = epochStart + EPOCH_DURATION_SEC;

      const overlapStart = Math.max(epochStart, windowStart);
      const overlapEnd = Math.min(epochEnd, windowEnd);
      if (overlapEnd <= overlapStart) continue;

      const overlapSec = BigInt(overlapEnd - overlapStart);
      const allocatedFee = feesAmount * overlapSec / BigInt(EPOCH_DURATION_SEC);
      if (allocatedFee === 0n) continue;

      // Resolve rates at the log's block — rates are mutable post-deployment, so
      // applying the current value to historical events would misattribute revenue.
      const logBlock = Number(log.blockNumber);
      const performanceFee = rateAtBlock(perfFeeHistory, currentPerformanceFee, logBlock);
      const ecosystemFeeRate = rateAtBlock(ecosystemRateHistory, currentEcosystemRate, logBlock);

      // Split performance fee into ecosystem / protocol per SystemVariables.feeRates().
      // Known limitation: FeeManager.emitFees redirects the ecosystem portion to
      // the protocol when no rKSU is eligible (ksuLocking.eligibleRKSUForFees == 0).
      // That runtime redirection is not modeled here — when it happens,
      // dailyHoldersRevenue is slightly overstated and dailyProtocolRevenue slightly
      // understated. Documented in `methodology`.
      const ecosystemFee = allocatedFee * ecosystemFeeRate / FULL_PERCENT;
      const protocolFee = allocatedFee - ecosystemFee;

      // Back-calculate lender share from the performance fee rate:
      //   allocatedFee = grossInterest * performanceFee / FULL_PERCENT
      //   supplySide   = grossInterest - allocatedFee
      const supplySide = performanceFee > 0n
        ? allocatedFee * (FULL_PERCENT - performanceFee) / performanceFee
        : 0n;

      const grossInterest = allocatedFee + supplySide;

      dailyFees.add(paymentToken, grossInterest, METRIC.BORROW_INTEREST);
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
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross interest paid by borrowers across Kasu lending pools (performance fees + lender share). Interest accrued during each epoch is spread evenly across the epoch's days.",
  UserFees: "Same as Fees - borrowers pay interest on borrowed assets.",
  Revenue: "Performance fees captured within the Kasu system: the sum of the protocol-receiver share (ProtocolRevenue) and the rKSU-holder share (HoldersRevenue). Neither is paid to external suppliers.",
  ProtocolRevenue: "Performance fees sent to the protocol fee receiver.",
  HoldersRevenue: "Performance fees distributed to KSU token lockers (rKSU holders). When no rKSU is eligible, the FeeManager redirects this share to the protocol at runtime; such redirection is not reflected in the breakdown.",
  SupplySideRevenue: "Interest earned by lenders (gross borrower interest minus performance fees).",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
      [METRIC.BORROW_INTEREST]: "Gross interest paid by borrowers before the lender/protocol split",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "Share of performance fees routed to the protocol fee receiver",
      ["Ecosystem fees"]: "Share of performance fees routed to rKSU holders",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "Share of performance fees routed to the protocol fee receiver",
    },
    HoldersRevenue: {
      ["Ecosystem fees"]: "Performance fees distributed to KSU token lockers (rKSU holders)",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Interest earned by lenders after performance fees are deducted",
    },
  },
};

export default adapter;
