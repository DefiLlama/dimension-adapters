import type { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'
import { UserVaultTracker, ExtendedVaultInfo } from './user-vault-tracker';

// Admin address that performs rebalancing
const ADMIN_ADDRESS = "0xEeEE7d713aDf6f408dd3637987191B35E3A872b0";

// USDC token address for different chains
const USDC_ADDRESSES = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.USDC,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.USDC,
  [CHAIN.BASE]: ADDRESSES.base.USDC,
  [CHAIN.POLYGON]: ADDRESSES.polygon.USDC,
  [CHAIN.OPTIMISM]: ADDRESSES.optimism.USDC,
  [CHAIN.BSC]: ADDRESSES.bsc.USDC,
};

// Core Event ABIs - only the events actually used in your project
const REBALANCED_EVENT = 'event Rebalanced(address indexed fromVault, address indexed toVault, uint256 amount)';
const WITHDRAWAL_EVENT = 'event Withdrawal(address indexed vault, address indexed recipient, uint256 amount)';
const DEPOSIT_EVENT = 'event Deposit(address indexed vault, address indexed depositor, uint256 amount)';

// Dynamic vault discovery using UserVaultTracker

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { chain, getLogs, createBalances, api } = options;
  const dailyVolume = createBalances();
  const totalVolume = createBalances();
  
  // Get USDC address for the current chain
  const usdcAddress = USDC_ADDRESSES[chain];
  if (!usdcAddress) {
    console.warn(`USDC address not found for chain: ${chain}`);
    return { dailyVolume, totalVolume };
  }

  try {
    // Only process Base chain, skip others
    if (chain !== CHAIN.BASE) {
      console.log(`📊 Skipping chain: ${chain} (only Base chain supported)`);
      return { dailyVolume, totalVolume };
    }
    
    console.log(`🔍 Starting core volume tracking for chain: ${chain}`);
    
    // Step 1: Get vault addresses dynamically using UserVaultTracker
    let vaultAddresses: string[] = [];
    
    console.log(`🏭 Discovering vaults using UserVaultTracker...`);
    const vaultTracker = new UserVaultTracker(chain);
    const allVaults = await vaultTracker.getAllUserVaults();
    vaultAddresses = allVaults.map(vault => vault.vaultAddress);
    console.log(`📊 Discovered ${vaultAddresses.length} vault addresses dynamically`);
    
    // Step 2: Get blocks for both requested period and total history
    console.log(`📅 Requested time range: ${new Date(options.fromTimestamp * 1000).toISOString()} to ${new Date(options.toTimestamp * 1000).toISOString()}`);
    
    // Get block numbers for requested daily time range
    const dailyFromBlock = await options.getFromBlock();
    const dailyToBlock = await options.getToBlock();
    console.log(`🔢 Daily blocks: ${dailyFromBlock} to ${dailyToBlock}`);
    
    // Use extended time range from deployment date (Aug-30-2025) to current date for total volume
    const deploymentDate = new Date('2025-08-30T12:52:57Z');
    const currentDate = new Date();
    const extendedFromTimestamp = Math.floor(deploymentDate.getTime() / 1000);
    const extendedToTimestamp = Math.floor(currentDate.getTime() / 1000);
    
    console.log(`📅 TOTAL HISTORY time range: ${deploymentDate.toISOString()} to ${currentDate.toISOString()}`);
    
    // Get block numbers for extended time range (total history)
    const extendedFromBlock = await options.getBlock(extendedFromTimestamp, chain, {} as any);
    const extendedToBlock = await options.getBlock(extendedToTimestamp, chain, {} as any);
    console.log(`🔢 Total history blocks: ${extendedFromBlock} to ${extendedToBlock}`);
    
    // Step 3: Track REBALANCED events for DAILY period
    console.log(`🔄 Fetching daily rebalance events...`);
    let dailyRebalancedLogs: any[] = [];
    
    try {
      dailyRebalancedLogs = await getLogs({
        noTarget: true,
        eventAbi: REBALANCED_EVENT,
        fromBlock: dailyFromBlock,
        toBlock: dailyToBlock,
      });
    } catch (error: any) {
      console.warn(`⚠️ Error fetching DAILY REBALANCED events:`, error.message);
    }
    
    // Step 4: Track REBALANCED events for TOTAL HISTORY
    console.log(`🔄 Fetching total history rebalance events...`);
    let totalRebalancedLogs: any[] = [];
    
    try {
      totalRebalancedLogs = await getLogs({
        noTarget: true,
        eventAbi: REBALANCED_EVENT,
        fromBlock: extendedFromBlock,
        toBlock: extendedToBlock,
      });
    } catch (error: any) {
      console.warn(`⚠️ Error fetching TOTAL REBALANCED events globally:`, error.message);
      
      // Fallback: try from vault addresses if global search fails
      if (vaultAddresses.length > 0) {
        try {
          totalRebalancedLogs = await getLogs({
            targets: vaultAddresses,
            eventAbi: REBALANCED_EVENT,
            fromBlock: extendedFromBlock,
            toBlock: extendedToBlock,
          });
        } catch (secondError: any) {
          console.warn(`⚠️ Error fetching TOTAL REBALANCED events from vaults:`, secondError.message);
        }
      }
    }

    // Step 5: Track WITHDRAWAL events for DAILY period
    console.log(`💸 Fetching daily withdrawal events...`);
    let dailyWithdrawalLogs: any[] = [];
    if (vaultAddresses.length > 0) {
      try {
        dailyWithdrawalLogs = await getLogs({
          targets: vaultAddresses,
          eventAbi: WITHDRAWAL_EVENT,
          fromBlock: dailyFromBlock,
          toBlock: dailyToBlock,
        });
      } catch (error: any) {
        console.warn(`⚠️ Error fetching DAILY WITHDRAWAL events:`, error.message);
      }
    }
    
    // Step 6: Track WITHDRAWAL events for TOTAL HISTORY
    console.log(`💸 Fetching total history withdrawal events...`);
    let totalWithdrawalLogs: any[] = [];
    if (vaultAddresses.length > 0) {
      try {
        totalWithdrawalLogs = await getLogs({
          targets: vaultAddresses,
          eventAbi: WITHDRAWAL_EVENT,
          fromBlock: extendedFromBlock,
          toBlock: extendedToBlock,
        });
      } catch (error: any) {
        console.warn(`⚠️ Error fetching TOTAL WITHDRAWAL events:`, error.message);
      }
    }

    // Step 7: Track DEPOSIT events for DAILY period
    console.log(`💰 Fetching daily deposit events...`);
    let dailyDepositLogs: any[] = [];
    if (vaultAddresses.length > 0) {
      try {
        dailyDepositLogs = await getLogs({
          targets: vaultAddresses,
          eventAbi: DEPOSIT_EVENT,
          fromBlock: dailyFromBlock,
          toBlock: dailyToBlock,
        });
      } catch (error: any) {
        console.warn(`⚠️ Error fetching DAILY DEPOSIT events:`, error.message);
      }
    }
    
    // Step 8: Track DEPOSIT events for TOTAL HISTORY
    console.log(`💰 Fetching total history deposit events...`);
    let totalDepositLogs: any[] = [];
    if (vaultAddresses.length > 0) {
      try {
        totalDepositLogs = await getLogs({
          targets: vaultAddresses,
          eventAbi: DEPOSIT_EVENT,
          fromBlock: extendedFromBlock,
          toBlock: extendedToBlock,
        });
      } catch (error: any) {
        console.warn(`⚠️ Error fetching TOTAL DEPOSIT events:`, error.message);
      }
    }

    // Step 9: Get initialDepositAmount from each vault
    console.log(`🔢 Fetching initial deposit amounts from ${vaultAddresses.length} vaults...`);
    let totalInitialDepositAmounts = BigInt(0);
    let dailyInitialDepositAmounts = BigInt(0);
    let successfulCalls = 0;
    let vaultInitialDeposits: Array<{vault: string, amount: bigint, createdInDaily: boolean}> = [];
    
    if (vaultAddresses.length > 0) {
      for (const vaultInfo of allVaults) {
        const vaultAddress = vaultInfo.vaultAddress;
        const deployedAt = vaultInfo.deployedAt;
        const isCreatedInDailyPeriod = deployedAt >= dailyFromBlock && deployedAt <= dailyToBlock;
        
        try {
          const initialDepositAmount = await api.call({
            target: vaultAddress,
            abi: 'function initialDepositAmount() view returns (uint256)',
          });
          if (initialDepositAmount && initialDepositAmount !== '0') {
            const amount = BigInt(initialDepositAmount);
            totalInitialDepositAmounts += amount;
            if (isCreatedInDailyPeriod) {
              dailyInitialDepositAmounts += amount;
            }
            vaultInitialDeposits.push({ vault: vaultAddress, amount, createdInDaily: isCreatedInDailyPeriod });
          }
          successfulCalls++;
        } catch (error: any) {
          // Try alternative ABI format
          try {
            const initialDepositAmount = await api.call({
              target: vaultAddress,
              abi: 'initialDepositAmount',
            });
            if (initialDepositAmount && initialDepositAmount !== '0') {
              const amount = BigInt(initialDepositAmount);
              totalInitialDepositAmounts += amount;
              if (isCreatedInDailyPeriod) {
                dailyInitialDepositAmounts += amount;
              }
              vaultInitialDeposits.push({ vault: vaultAddress, amount, createdInDaily: isCreatedInDailyPeriod });
            }
            successfulCalls++;
          } catch (secondError: any) {
            // This vault might be a different contract version or type
            continue;
          }
        }
      }
    }

    // Step 10: Calculate DAILY volume
    console.log(`📊 Calculating volumes...`);
    let dailyRebalanced = BigInt(0);
    let dailyWithdrawals = BigInt(0);
    let dailyDeposits = BigInt(0);

    // Process DAILY REBALANCED events
    for (const log of dailyRebalancedLogs) {
      const amount = BigInt(log.amount);
      dailyRebalanced += amount;
    }

    // Process DAILY WITHDRAWAL events
    for (const log of dailyWithdrawalLogs) {
      const amount = BigInt((log as any)[2] || (log as any).amount || 0);
      dailyWithdrawals += amount;
    }

    // Process DAILY DEPOSIT events (tracked but NOT added to volume)
    for (const log of dailyDepositLogs) {
      const amount = BigInt((log as any)[2] || (log as any).amount || 0);
      dailyDeposits += amount;
    }

    // Calculate daily volume: Rebalanced + Withdrawals (NO initial deposits for daily)
    const dailyVolumeAmount = dailyRebalanced + dailyWithdrawals;
    
    // Add the daily volume
    if (dailyVolumeAmount > 0) {
      dailyVolume.add(usdcAddress, dailyVolumeAmount);
    }

    // Step 11: Calculate TOTAL HISTORY volume
    let historyRebalanced = BigInt(0);
    let historyWithdrawals = BigInt(0);
    let historyDeposits = BigInt(0);

    // Process TOTAL REBALANCED events
    for (const log of totalRebalancedLogs) {
      const amount = BigInt(log.amount);
      historyRebalanced += amount;
    }

    // Process TOTAL WITHDRAWAL events
    for (const log of totalWithdrawalLogs) {
      const amount = BigInt((log as any)[2] || (log as any).amount || 0);
      historyWithdrawals += amount;
    }

    // Process TOTAL DEPOSIT events (tracked but NOT added to volume)
    for (const log of totalDepositLogs) {
      const amount = BigInt((log as any)[2] || (log as any).amount || 0);
      historyDeposits += amount;
    }

    // Calculate total volume: Rebalanced + Withdrawals + Initial Deposit Amounts
    const totalVolumeAmount = historyRebalanced + historyWithdrawals + totalInitialDepositAmounts;
    
    // Add the total volume
    if (totalVolumeAmount > 0) {
      totalVolume.add(usdcAddress, totalVolumeAmount);
    }

    // Step 12: Log clean summary with all information
    // Helper function to format numbers
    const formatAmount = (amount: bigint): string => {
      const usdc = Number(amount) / 1e6; // Convert from smallest unit to USDC
      if (usdc === 0) return '0 USDC';
      if (usdc < 1000) return `${usdc.toFixed(2)} USDC`;
      if (usdc < 1_000_000) return `${(usdc / 1000).toFixed(2)}K USDC`;
      if (usdc < 1_000_000_000) return `${(usdc / 1_000_000).toFixed(2)}M USDC`;
      return `${(usdc / 1_000_000_000).toFixed(2)}B USDC`;
    };

    console.log(`\n${"═".repeat(100)}`);
    console.log(`📊 SURF MORPHO REBALANCER - VOLUME SUMMARY`);
    console.log(`${"═".repeat(100)}`);
    
    // Daily Summary
    const dailyVaultsCreated = vaultInitialDeposits.filter(v => v.createdInDaily).length;
    console.log(`\n📅 DAILY VOLUME (${new Date(options.fromTimestamp * 1000).toISOString().split('T')[0]} to ${new Date(options.toTimestamp * 1000).toISOString().split('T')[0]}):`);
    console.log(`   Rebalanced Events: ${dailyRebalancedLogs.length} → ${formatAmount(dailyRebalanced)}`);
    console.log(`   Withdrawal Events: ${dailyWithdrawalLogs.length} → ${formatAmount(dailyWithdrawals)}`);
    console.log(`   Initial Deposits: ${dailyVaultsCreated} vaults → ${formatAmount(dailyInitialDepositAmounts)}`);
    console.log(`   ────────────────────────────────────────────────────────────`);
    console.log(`   DAILY TOTAL: ${formatAmount(dailyVolumeAmount)}`);

    // Total History Summary
    console.log(`\n📈 TOTAL HISTORY (Aug 30, 2025 to now):`);
    console.log(`   Rebalanced Events: ${totalRebalancedLogs.length} → ${formatAmount(historyRebalanced)}`);
    console.log(`   Withdrawal Events: ${totalWithdrawalLogs.length} → ${formatAmount(historyWithdrawals)}`);
    console.log(`   Initial Deposits: ${vaultAddresses.length} vaults → ${formatAmount(totalInitialDepositAmounts)}`);
    console.log(`   ────────────────────────────────────────────────────────────`);
    console.log(`   TOTAL VOLUME: ${formatAmount(totalVolumeAmount)}`);

    // Event Breakdown
    console.log(`\n📊 EVENT BREAKDOWN:`);
    console.log(`   Rebalance Events (globally): ${totalRebalancedLogs.length}`);
    console.log(`   Withdrawal Events: ${totalWithdrawalLogs.length}`);
    console.log(`   Vaults Tracked: ${vaultAddresses.length}`);
    console.log(`   Function Calls: ${successfulCalls}/${vaultAddresses.length}`);
    
    // Initial Deposit Breakdown by Vault
    console.log(`\n💰 INITIAL DEPOSIT AMOUNTS BY VAULT:`);
    if (vaultInitialDeposits.length > 0) {
      // Sort by amount (descending)
      const sortedDeposits = vaultInitialDeposits.sort((a, b) => 
        Number(b.amount - a.amount)
      );
      
      // Show top 10 vaults
      const displayCount = Math.min(10, sortedDeposits.length);
      console.log(`   Showing top ${displayCount} of ${sortedDeposits.length} vaults with initial deposits:\n`);
      
      sortedDeposits.slice(0, displayCount).forEach((item, index) => {
        const usdc = Number(item.amount) / 1e6;
        const shortAddress = `${item.vault.slice(0, 6)}...${item.vault.slice(-4)}`;
        const dailyTag = item.createdInDaily ? ' [NEW TODAY]' : '';
        console.log(`   ${index + 1}. ${shortAddress}: ${formatAmount(item.amount)}${dailyTag}`);
      });
      
      if (sortedDeposits.length > displayCount) {
        console.log(`   ... and ${sortedDeposits.length - displayCount} more vaults`);
      }
      
      console.log(`\n   Total from ${vaultInitialDeposits.length} vaults: ${formatAmount(totalInitialDepositAmounts)}`);
      if (dailyVaultsCreated > 0) {
        console.log(`   Created today: ${dailyVaultsCreated} vaults → ${formatAmount(dailyInitialDepositAmounts)}`);
      }
    } else {
      console.log(`   No vaults with initial deposits found`);
    }
    
    console.log(`${"═".repeat(100)}\n`);

  } catch (error: any) {
    console.error(`❌ Error fetching core volume data for chain ${chain}:`, error);
  }

  return {
    dailyVolume,
    totalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2024-01-01", // Adjust start date as needed
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2024-01-01",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2025-08-30", // Start from August 30, 2025 (deployment date)
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2024-01-01",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2024-01-01",
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2024-01-01",
    },
  },
  methodology: {
    Volume: "Daily Volume = Rebalanced events + Withdrawal events for the requested time period. Total Volume = All Rebalanced events (globally, all history from Aug 30, 2025) + All Withdrawal events (from vaults, all history) + Initial Deposit Amounts (from all vaults). DEPOSIT events are tracked but filtered out and NOT included in volume to avoid double-counting. Uses dynamic vault discovery via UserVaultTracker from factory contract 0x1D283b668F947E03E8ac8ce8DA5505020434ea0E on Base chain.",
  },
};

export default adapter;