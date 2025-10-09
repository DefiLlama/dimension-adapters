import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
 * @returns Object containing daily fees and revenue
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

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

    // Sort events by block number for chronological processing
    const sortedStates = vaultStates.sort((a, b) => a.blockNumber - b.blockNumber);
    const allFeeEvents = [...vaultManagementFeesLogs, ...vaultPerformanceFeesLogs]
      .sort((a, b) => a.blockNumber - b.blockNumber);

    // Calculate total fee shares collected
    const totalFeeShares = allFeeEvents.reduce((sum, event) =>
      sum + Number(event[1]), 0);

    let sharePrice: number | undefined;

    // Determine share price based on the number of states found in the daily range
    if (sortedStates.length > 1) {
      // If multiple states, calculate average share price
      const totalSharePrice = sortedStates.reduce((sum, state) => {
        const sp = Number(state[0]) / Number(state[1]);
        return sum + sp;
      }, 0);
      sharePrice = totalSharePrice / sortedStates.length;
    } else if (sortedStates.length === 1) {
      // If only one state, use its share price
      const state = sortedStates[0];
      sharePrice = Number(state[0]) / Number(state[1]);
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
        sharePrice = Number(latestState[0]) / Number(latestState[1]);
      }
    }

    // Calculate and add fees if we determined a valid share price
    if (sharePrice !== undefined) {
      // Convert fee shares to underlying asset amount using the determined share price
      const totalFeeInAssets = totalFeeShares * sharePrice;

      dailyFees.add(assetAddress, totalFeeInAssets);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees, // All fees are revenue
  };
};

/**
 * BasisOS adapter configuration
 */
const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-04-26',
    },
  },
  methodology: {
    Fees: "Sum of management and performance fees collected from all vaults",
    Revenue: "Sum of management and performance fees collected from all vaults",
  },
};

export default adapter;
