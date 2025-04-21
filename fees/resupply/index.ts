import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const reUSD = "0x57aB1E0003F623289CD798B1824Be09a793e4Bec";
const registry = "0x10101010E0C3171D894B71B3400668aF311e7D94";
const abi = {
  addInterest: "event AddInterest(uint256 interestEarned, uint256 rate)",
  redeemed:
    "event Redeemed(address indexed _caller, uint256 _amount, uint256 _collateralFreed, uint256 _protocolFee, uint256 _debtReduction)",
  splits:
    "function splits() external view returns (tuple(uint80 insurance, uint80 treasury, uint80 platform))",
  getAddress: "function getAddress(string key) external view returns (address)",
  splitsSet:
    "event SplitsSet(uint80 insurance, uint80 treasury, uint80 platform)",
};

const WEEK = 604800; // 7 days in seconds
const SPLIT_RATIO_PRECISION = 10000;

// Get the start of the epoch (Thursday 00:00 UTC) for a given timestamp
const getEpochStart = (timestamp: number) =>
  Math.floor(timestamp / WEEK) * WEEK;

// Define type for split history records with epochs
type SplitEpochRecord = {
  startEpoch: number;        // Epoch when this split becomes active
  endEpoch: number | null;   // Epoch when this split is no longer active (null = still active)
  insurance: number;
  treasury: number;
  platform: number;
  blockNumber: number;       // For sorting and reference
  timestamp: number;         // Original timestamp
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const pairContracts = await options.api.call({
    abi: "address[]:getAllPairAddresses",
    target: registry,
  });
  const feeDepositController = await options.api.call({
    target: registry,
    abi: abi.getAddress,
    params: ["FEE_DEPOSIT_CONTROLLER"],
  });

  // Get all SplitsSet events to track history of split changes
  const splitsSetLogs = await options.getLogs({
    target: feeDepositController,
    eventAbi: abi.splitsSet,
  });

  // Get current splits for default value
  const currentSplits = await options.api.call({
    target: feeDepositController,
    abi: abi.splits,
  });

  // Define a data structure to track splits history by epoch
  const splitsByEpoch: Map<number, SplitEpochRecord> = new Map();

  // Process splits logs chronologically
  const sortedSplitsLogs = [...splitsSetLogs].sort((a, b) => a._blockNumber - b._blockNumber);

  // Add current splits as fallback if no logs
  if (sortedSplitsLogs.length === 0) {
    const currentEpoch = getEpochStart(Math.floor(Date.now() / 1000));
    splitsByEpoch.set(currentEpoch, {
      startEpoch: currentEpoch,
      endEpoch: null,
      insurance: +currentSplits.insurance,
      treasury: +currentSplits.treasury,
      platform: +currentSplits.platform,
      blockNumber: 0,
      timestamp: 0,
    });
  }

  // Process all split set events
  sortedSplitsLogs.forEach((log) => {
    const logEpoch = getEpochStart(log._blockTimestamp);

    // Find if there's an existing split for this epoch
    const existingSplit = splitsByEpoch.get(logEpoch);

    if (existingSplit) {
      // If split already exists for this epoch, update it with the newest values
      existingSplit.insurance = +log.insurance;
      existingSplit.treasury = +log.treasury;
      existingSplit.platform = +log.platform;
      existingSplit.blockNumber = log._blockNumber;
      existingSplit.timestamp = log._blockTimestamp;
    } else {
      // Close previous epoch splits if they exist
      const previousEpochs = Array.from(splitsByEpoch.keys());
      previousEpochs.forEach((epoch) => {
        const record = splitsByEpoch.get(epoch);
        if (record && record.endEpoch === null) {
          // This record is still active, set its end date
          record.endEpoch = logEpoch;
        }
      });

      // Create a new split record
      splitsByEpoch.set(logEpoch, {
        startEpoch: logEpoch,
        endEpoch: null, // Still active
        insurance: +log.insurance,
        treasury: +log.treasury,
        platform: +log.platform,
        blockNumber: log._blockNumber,
        timestamp: log._blockTimestamp,
      });
    }
  });

  // Convert the Map to an array for easier access
  const splitsHistory = Array.from(splitsByEpoch.values())
    .sort((a, b) => a.blockNumber - b.blockNumber);

  // Get interest logs and redemption logs
  const addInterestLogs = await options.getLogs({
    targets: pairContracts as any,
    eventAbi: abi.addInterest,
  });
  const redeemedLogs = await options.getLogs({
    targets: pairContracts as any,
    eventAbi: abi.redeemed,
  });

  // Calculate and track interest split ratios based on block and epoch
  const interestFeesByApplicableSplit = new Map<SplitEpochRecord, number>();

  // Process interest fees (special epoch rules apply)
  addInterestLogs.forEach((log) => {
    // Add to total fees
    dailyFees.add(reUSD, log.interestEarned);

    // Get the epoch for this interest event
    const logEpoch = getEpochStart(log._blockTimestamp);

    // Find the applicable split for this interest event
    // Special rule: For interest, a split applies to its current epoch and also affects interest from up to 2 epochs back
    const applicableSplit = splitsHistory
      .filter((split) => {
        // Check if the split is active at or after the event's epoch
        // OR if the split's epoch is within 2 epochs of the event (retroactive application)
        return (
          (split.blockNumber <= log._blockNumber) &&
          (split.startEpoch <= logEpoch) &&
          (split.endEpoch === null || split.endEpoch > logEpoch) ||
          (logEpoch >= split.startEpoch - 2 * WEEK)
        );
      })
      .sort((a, b) => b.blockNumber - a.blockNumber)[0];

    // If we still can't find an applicable split, use the earliest one
    const fallbackSplit = splitsHistory.length > 0 ? splitsHistory[0] : {
      startEpoch: 0,
      endEpoch: null,
      insurance: +currentSplits.insurance,
      treasury: +currentSplits.treasury,
      platform: +currentSplits.platform,
      blockNumber: 0,
      timestamp: 0,
    };

    const splitToUse = applicableSplit || fallbackSplit;

    // Add this interest to the appropriate splits bucket
    const currentAmount = interestFeesByApplicableSplit.get(splitToUse) || 0;
    interestFeesByApplicableSplit.set(
      splitToUse,
      currentAmount + Number(log.interestEarned)
    );
  });

  // Process redemption fees (don't apply splits - all to protocol revenue)
  let totalRedemptionFees = 0n; // Use BigInt
  redeemedLogs.forEach((log) => {
    // Ensure we handle BigInt values properly
    dailyFees.add(reUSD, log._protocolFee);
    // Convert to BigInt for accumulation
    totalRedemptionFees += BigInt(log._protocolFee);
  });

  // Create revenue balances
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Calculate split amounts for each bucket of interest fees
  for (const [splitRecord, amount] of interestFeesByApplicableSplit.entries()) {
    const insuranceAmount =
      (amount * splitRecord.insurance) / SPLIT_RATIO_PRECISION;
    const treasuryAmount =
      (amount * splitRecord.treasury) / SPLIT_RATIO_PRECISION;
    const platformAmount =
      (amount * splitRecord.platform) / SPLIT_RATIO_PRECISION;

    dailySupplySideRevenue.add(reUSD, insuranceAmount);
    dailyRevenue.add(reUSD, treasuryAmount + platformAmount);
    dailyProtocolRevenue.add(reUSD, treasuryAmount);
    dailyHoldersRevenue.add(reUSD, platformAmount);
  }

  // Add redemption fees to protocol revenue (100% to protocol)
  redeemedLogs.forEach((log) => {
    // Use the protocolFee directly for each log entry rather than accumulated total
    dailyProtocolRevenue.add(reUSD, log._protocolFee);
    dailyRevenue.add(reUSD, log._protocolFee);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  dailyFees: "Total interest paid by borrowers + redemption fees",
  dailyRevenue: "Protocol's share of interest (treasury + RSUP stakers)",
  dailyProtocolRevenue: "Treasury's portion of interest",
  dailyHoldersRevenue: "Platform fees distributed to RSUP stakers",
  dailySupplySideRevenue: "Interest paid to lenders in the insurance pool",
};

const adapters: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: "2025-03-13",
      meta: {
        methodology,
      },
    },
  },
  version: 2,
};

export default adapters;
