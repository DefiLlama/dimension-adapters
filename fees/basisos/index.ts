import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

/**
 * Address of the BasisOS Data Provider contract that stores vault addresses
 */
const DATA_PROVIDER_ADDRESS = '0xDD5C8aB2E9F113b397ff2b8528C649bAEf24dF97';

/**
 * Block number limit for historical VaultState search.
 */
const VAULT_STATE_BLOCK_LIMIT = 330229681;

/**
 * Fetches daily fees and revenue for BasisOS vaults
 * @param options - SDK options containing API access and helper functions
 * @returns Object containing daily fees and revenue with breakdown by fee type
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Get list of all vaults from data provider
  const vaults = await options.api.call({
    target: DATA_PROVIDER_ADDRESS,
    abi: 'function getAllVaults() external view returns (address[])',
  });

  for (const vault of vaults) {
    // Get underlying asset address for the vault
    const assetAddress = await options.api.call({
      target: vault,
      abi: 'function asset() view returns (address)',
    });

    // Get block range for the day
    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();

    // Fetch all relevant events for the day
    const vaultStates = await options.getLogs({
      target: vault,
      eventAbi: "event VaultState(uint256 indexed totalAssets, uint256 indexed totalSupply)",
      fromBlock,
      toBlock
    }) || [];

    const vaultManagementFeesLogs = await options.getLogs({
      target: vault,
      eventAbi: "event ManagementFeeCollected(address indexed feeRecipient, uint256 indexed feeShares)",
      fromBlock,
      toBlock
    }) || [];

    const vaultPerformanceFeesLogs = await options.getLogs({
      target: vault,
      eventAbi: "event PerformanceFeeCollected(address indexed feeRecipient, uint256 indexed feeShares)",
      fromBlock,
      toBlock
    }) || [];

    // Sort vault states by block number for chronological processing
    const sortedStates = vaultStates.sort((a, b) => a.blockNumber - b.blockNumber);

    // Calculate fee shares for management fees
    const managementFeeShares = vaultManagementFeesLogs.reduce((sum, event) =>
      sum + Number(event.feeShares), 0);
    
     // Calculate fee shares for performance fees
    const performanceFeeShares = vaultPerformanceFeesLogs.reduce((sum, event) =>
      sum + Number(event.feeShares), 0);

    let sharePrice: number | undefined;

    // Determine share price based on the number of states found in the daily range
    if (sortedStates.length > 1) {
      // If multiple states, calculate average share price
      const totalSharePrice = sortedStates.reduce((sum, state: any) => {
        const sp = Number(state.totalAssets) / Number(state.totalSupply);
        return sum + sp;
      }, 0);
      sharePrice = totalSharePrice / sortedStates.length;
    } else if (sortedStates.length === 1) {
      // If only one state, use its share price
      const state: any = sortedStates[0];
      sharePrice = Number(state.totalAssets) / Number(state.totalSupply);
    } else {
      // If no states in current period, search backwards for the latest state
      let currentBlock = fromBlock;
      let latestState = null;

      while (!latestState && currentBlock > VAULT_STATE_BLOCK_LIMIT) {
        const previousStates = await options.getLogs({
          target: vault,
          eventAbi: "event VaultState(uint256 indexed totalAssets, uint256 indexed totalSupply)",
          fromBlock: Math.max(VAULT_STATE_BLOCK_LIMIT, currentBlock - 50000),
          toBlock: currentBlock
        }) || [];

        if (previousStates.length > 0) {
          latestState = previousStates
            .sort((a, b) => b.blockNumber - a.blockNumber)[0];
        }

        currentBlock -= 50000;
      }

      if (latestState) {
        const state: any = latestState;
        sharePrice = Number(state.totalAssets) / Number(state.totalSupply);
      }
    }

    // Calculate and add fees if we determined a valid share price
    if (sharePrice !== undefined) {
      // Convert fee shares to underlying asset amount using the determined share price
      const managementFeeInAssets = managementFeeShares * sharePrice;
      const performanceFeeInAssets = performanceFeeShares * sharePrice;

        // Add management fees with metric
        dailyFees.add(assetAddress, managementFeeInAssets, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(assetAddress, managementFeeInAssets, METRIC.MANAGEMENT_FEES);

        // Add performance fees with metric
        dailyFees.add(assetAddress, performanceFeeInAssets, METRIC.PERFORMANCE_FEES);
        dailyRevenue.add(assetAddress, performanceFeeInAssets, METRIC.PERFORMANCE_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
  };
};

const methodology = {
  Fees: "Sum of management and performance fees collected from all vaults",
  Revenue: "Sum of management and performance fees collected from all vaults",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: "Management fees calculated as a percentage of total assets under management, collected periodically",
    [METRIC.PERFORMANCE_FEES]: "Performance fees calculated as a percentage of profits earned by the vault strategy",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Management fees collected from all vaults",
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected from all vaults",
  },
};

/**
 * BasisOS adapter configuration
 */
const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-04-26',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
