/**
 * Ethereum Paymasters Adapter (ERC-4337 Account Abstraction)
 *
 * This adapter scans the ERC-4337 EntryPoint v0.6 contract on Ethereum
 * and aggregates UserOperationEvent logs to compute the daily gas sponsored
 * by paymasters.
 *
 * Data Source: 100% on-chain, reading UserOperationEvent from EntryPoint
 * EntryPoint v0.6: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
 *
 * Methodology:
 * - We scan all UserOperationEvent emissions for the day
 * - Filter operations where paymaster != address(0)
 * - Sum actualGasCost for these sponsored operations
 * - Report as dailyFees and dailyRevenue (gas sponsored by paymasters)
 * - Include per-paymaster breakdown in metadata
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// ERC-4337 EntryPoint v0.6 on Ethereum Mainnet
// Deployed at block 16947124 (March 1, 2023)
// Reference: https://etherscan.io/address/0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789
const ENTRYPOINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

// UserOperationEvent ABI from ERC-4337 EntryPoint v0.6
// This event is emitted for every UserOperation executed through the EntryPoint
// Reference: https://etherscan.io/address/0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789#code
const USER_OPERATION_EVENT_ABI =
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)";

// Zero address constant for checking if paymaster is used
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Per-paymaster statistics
interface PaymasterStats {
  ops: number;           // Number of operations sponsored
  gasWei: string;        // Total gas spent in wei (as string to preserve precision)
  gasETH: string;        // Gas in ETH (human readable)
}

// Metadata returned with the adapter results
interface AdapterMetadata {
  totalUserOps: number;          // Total number of UserOps (sponsored + non-sponsored)
  sponsoredUserOps: number;      // Number of UserOps with paymaster
  nonSponsoredUserOps: number;   // Number of UserOps without paymaster
  sponsoredShare: number;        // Percentage of sponsored ops (0-1)
  sponsoredGasWei: string;       // Total gas sponsored in wei (as string for precision)
  sponsoredGasETH: string;       // Total gas sponsored in ETH
  perPaymaster: Record<string, PaymasterStats>; // Breakdown by paymaster address
}

/**
 * Convert wei (as BigInt) to ETH string without precision loss
 * Avoids Number() conversion which can overflow for large values
 */
function formatWeiToETH(wei: bigint): string {
  const ethWei = 1000000000000000000n; // 1e18
  const eth = wei / ethWei;
  const remainder = wei % ethWei;

  // Pad remainder to 18 digits
  const remainderStr = remainder.toString().padStart(18, '0');

  return `${eth}.${remainderStr}`;
}

/**
 * Fetch function that processes UserOperationEvent logs for a given time period
 *
 * DefiLlama's FetchOptions provides getFromBlock() and getToBlock() async functions
 * that return block numbers corresponding to the time range being queried.
 */
const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;

  // DefiLlama provides getFromBlock/getToBlock functions for the time range
  // Also support legacy startBlock/endBlock for local testing
  let fromBlock: number | undefined;
  let toBlock: number | undefined;

  // Try the new DefiLlama pattern first (getFromBlock/getToBlock functions)
  if (typeof (options as any).getFromBlock === 'function') {
    fromBlock = await (options as any).getFromBlock();
  } else if ((options as any).fromBlock !== undefined) {
    fromBlock = (options as any).fromBlock;
  } else if ((options as any).startBlock !== undefined) {
    fromBlock = (options as any).startBlock;
  }

  if (typeof (options as any).getToBlock === 'function') {
    toBlock = await (options as any).getToBlock();
  } else if ((options as any).toBlock !== undefined) {
    toBlock = (options as any).toBlock;
  } else if ((options as any).endBlock !== undefined) {
    toBlock = (options as any).endBlock;
  }

  // Initialize balances object to accumulate sponsored gas
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // Fetch all UserOperationEvent logs from the EntryPoint for the time period
  // IMPORTANT: Pass block range to avoid timeout on large historical queries
  const logs = await getLogs({
    target: ENTRYPOINT_V06,
    eventAbi: USER_OPERATION_EVENT_ABI,
    ...(fromBlock !== undefined && { fromBlock }),
    ...(toBlock !== undefined && { toBlock }),
  });

  // Statistics tracking
  let totalUserOps = 0;
  let sponsoredUserOps = 0;
  let totalSponsoredGasWei = 0n;

  // Per-paymaster breakdown (use Map to track BigInt internally)
  const paymasterGasMap = new Map<string, bigint>();
  const paymasterOpsMap = new Map<string, number>();

  // Process each UserOperation event
  for (const log of logs) {
    totalUserOps++;

    // Extract fields from the event
    const paymaster = (log.paymaster as string).toLowerCase();
    const gasCost = BigInt(log.actualGasCost);

    // Check if this operation is sponsored (has a non-zero paymaster)
    const isSponsored = paymaster !== ZERO_ADDRESS.toLowerCase();

    if (!isSponsored) {
      // Skip non-sponsored operations (user paid their own gas)
      continue;
    }

    // This operation is sponsored - count it
    sponsoredUserOps++;
    totalSponsoredGasWei += gasCost;

    // Add to daily balances (ETH gas token)
    // The createBalances() helper will convert this to USD using ETH price
    dailyFees.addGasToken(gasCost);
    dailyRevenue.addGasToken(gasCost);

    // Track per-paymaster statistics
    paymasterGasMap.set(paymaster, (paymasterGasMap.get(paymaster) || 0n) + gasCost);
    paymasterOpsMap.set(paymaster, (paymasterOpsMap.get(paymaster) || 0) + 1);
  }

  // Build per-paymaster breakdown with safe BigInt to string conversion
  const perPaymaster: Record<string, PaymasterStats> = {};
  for (const [address, gasWei] of paymasterGasMap.entries()) {
    perPaymaster[address] = {
      ops: paymasterOpsMap.get(address) || 0,
      gasWei: gasWei.toString(),
      gasETH: formatWeiToETH(gasWei),
    };
  }

  // Calculate metrics
  const nonSponsoredUserOps = totalUserOps - sponsoredUserOps;
  const sponsoredShare = totalUserOps === 0 ? 0 : sponsoredUserOps / totalUserOps;
  const sponsoredGasETH = formatWeiToETH(totalSponsoredGasWei);

  // Build metadata object
  const metadata: AdapterMetadata = {
    totalUserOps,
    sponsoredUserOps,
    nonSponsoredUserOps,
    sponsoredShare,
    sponsoredGasWei: totalSponsoredGasWei.toString(),
    sponsoredGasETH,
    perPaymaster,
  };

  // Return results in DefiLlama dimension-adapter format
  return {
    dailyFees,      // Gas spent by paymasters to sponsor operations
    dailyRevenue,   // Same as fees (represents cost to paymaster infrastructure)
    meta: metadata, // Additional statistics and breakdown
  };
};

/**
 * Adapter configuration
 */
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      // EntryPoint v0.6 deployed at block 16947124 (March 1, 2023)
      // https://etherscan.io/tx/0x3e985a5d1fb0f3cddc814c0632e66d1db7e3dd12b2093d6e0de60f2e4f7c6a63
      start: 1677628800, // March 1, 2023 00:00:00 UTC
      meta: {
        methodology: {
          Fees:
            "Sum of actualGasCost for all ERC-4337 UserOperations on Ethereum that use a non-zero paymaster address (sponsored gas). " +
            "We scan UserOperationEvent logs from the EntryPoint v0.6 contract (0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789) and aggregate " +
            "the gas cost paid by paymasters to sponsor user operations.",
          Revenue:
            "Same as fees, interpreted as total gas spent by paymasters to sponsor user operations. " +
            "This represents the actual cost incurred by paymaster infrastructure providers (Pimlico, Alchemy, Stackup, etc.) " +
            "to enable gasless transactions for end users.",
        },
      },
    },
  },
};

export default adapter;
