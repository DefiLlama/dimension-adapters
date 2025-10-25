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
  const usdcAddress = USDC_ADDRESSES[chain as keyof typeof USDC_ADDRESSES];
  if (!usdcAddress) {
    return { dailyVolume, totalVolume };
  }

  // Only process Base chain, skip others
  if (chain !== CHAIN.BASE) {
    console.log(`Skipping chain ${chain} - only Base chain is supported`);
    return { dailyVolume, totalVolume };
  }
  
  // Get vault addresses dynamically using UserVaultTracker
  const vaultTracker = new UserVaultTracker(chain);
  const allVaults = await vaultTracker.getAllUserVaults();
  const vaultAddresses = allVaults.map(vault => vault.vaultAddress);
  
  // Get block numbers for requested daily time range
  const dailyFromBlock = await options.getFromBlock();
  const dailyToBlock = await options.getToBlock();
  
  // Get block numbers for extended time range (total history)
  const deploymentDate = new Date('2025-08-30T12:52:57Z');
  const currentDate = new Date();
  const extendedFromTimestamp = Math.floor(deploymentDate.getTime() / 1000);
  const extendedToTimestamp = Math.floor(currentDate.getTime() / 1000);
  const extendedFromBlock = await options.getBlock(extendedFromTimestamp, chain, {} as any);
  const extendedToBlock = await options.getBlock(extendedToTimestamp, chain, {} as any);
  
  // Track REBALANCED events for DAILY period
  const dailyRebalancedLogs = await getLogs({
    noTarget: true,
    eventAbi: REBALANCED_EVENT,
    fromBlock: dailyFromBlock,
    toBlock: dailyToBlock,
  });
  
  // Track REBALANCED events for TOTAL HISTORY
  let totalRebalancedLogs = await getLogs({
    noTarget: true,
    eventAbi: REBALANCED_EVENT,
    fromBlock: extendedFromBlock,
    toBlock: extendedToBlock,
  });
  
  // Fallback: try from vault addresses if global search fails
  if (vaultAddresses.length > 0 && totalRebalancedLogs.length === 0) {
    totalRebalancedLogs = await getLogs({
      targets: vaultAddresses,
      eventAbi: REBALANCED_EVENT,
      fromBlock: extendedFromBlock,
      toBlock: extendedToBlock,
    });
  }

  // Track WITHDRAWAL events for DAILY period
  const dailyWithdrawalLogs = vaultAddresses.length > 0 ? await getLogs({
    targets: vaultAddresses,
    eventAbi: WITHDRAWAL_EVENT,
    fromBlock: dailyFromBlock,
    toBlock: dailyToBlock,
  }) : [];
  
  // Track WITHDRAWAL events for TOTAL HISTORY
  const totalWithdrawalLogs = vaultAddresses.length > 0 ? await getLogs({
    targets: vaultAddresses,
    eventAbi: WITHDRAWAL_EVENT,
    fromBlock: extendedFromBlock,
    toBlock: extendedToBlock,
  }) : [];

  // Track DEPOSIT events for DAILY period
  const dailyDepositLogs = vaultAddresses.length > 0 ? await getLogs({
    targets: vaultAddresses,
    eventAbi: DEPOSIT_EVENT,
    fromBlock: dailyFromBlock,
    toBlock: dailyToBlock,
  }) : [];
  
  // Track DEPOSIT events for TOTAL HISTORY
  const totalDepositLogs = vaultAddresses.length > 0 ? await getLogs({
    targets: vaultAddresses,
    eventAbi: DEPOSIT_EVENT,
    fromBlock: extendedFromBlock,
    toBlock: extendedToBlock,
  }) : [];

  // Get initialDepositAmount from each vault
  let totalInitialDepositAmounts = BigInt(0);
  
  if (vaultAddresses.length > 0) {
    for (const vaultInfo of allVaults) {
      const vaultAddress = vaultInfo.vaultAddress;
      
      const initialDepositAmount = await api.call({
        target: vaultAddress,
        abi: 'function initialDepositAmount() view returns (uint256)',
      });
      if (initialDepositAmount && initialDepositAmount !== '0') {
        const amount = BigInt(initialDepositAmount);
        totalInitialDepositAmounts += amount;
      }
    }
  }

  // Calculate DAILY volume
  const dailyRebalanced = dailyRebalancedLogs.reduce((sum, log) => sum + BigInt(log.amount), BigInt(0));
  const dailyWithdrawals = dailyWithdrawalLogs.reduce((sum, log) => sum + BigInt((log as any)[2] || (log as any).amount || 0), BigInt(0));
  const dailyVolumeAmount = dailyRebalanced + dailyWithdrawals;
  
  if (dailyVolumeAmount > 0) {
    dailyVolume.add(usdcAddress, dailyVolumeAmount);
  }

  // Calculate TOTAL HISTORY volume
  const historyRebalanced = totalRebalancedLogs.reduce((sum, log) => sum + BigInt(log.amount), BigInt(0));
  const historyWithdrawals = totalWithdrawalLogs.reduce((sum, log) => sum + BigInt((log as any)[2] || (log as any).amount || 0), BigInt(0));
  const totalVolumeAmount = historyRebalanced + historyWithdrawals + totalInitialDepositAmounts;
  
  if (totalVolumeAmount > 0) {
    totalVolume.add(usdcAddress, totalVolumeAmount);
  }

  // Calculate transaction counts
  const dailyTransactions = dailyRebalancedLogs.length + dailyWithdrawalLogs.length + dailyDepositLogs.length;
  const totalTransactions = totalRebalancedLogs.length + totalWithdrawalLogs.length + totalDepositLogs.length;

  // Professional Dashboard Output
  const formatNumber = (num: bigint) => {
    const numStr = num.toString();
    if (numStr.length > 6) {
      return (Number(num) / 1e6).toFixed(2) + 'M';
    } else if (numStr.length > 3) {
      return (Number(num) / 1e3).toFixed(2) + 'K';
    }
    return numStr;
  };

  const formatUSDC = (amount: bigint) => {
    return (Number(amount) / 1e6).toFixed(2);
  };

  const boxWidth = 68;
  const createBoxLine = (text: string) => {
    const paddedText = text.padEnd(boxWidth - 2);
    return `║${paddedText}║`;
  };

  console.log("╔" + "═".repeat(boxWidth - 2) + "╗");
  console.log(createBoxLine("                  SURF MORPHO REBALANCER                  "));
  console.log(createBoxLine("                      DASHBOARD                          "));
  console.log("╠" + "═".repeat(boxWidth - 2) + "╣");
  console.log(createBoxLine(`📊 Total User Vaults: ${vaultAddresses.length.toString().padStart(8)} vaults`));
  console.log(createBoxLine(`📈 Daily Transactions: ${dailyTransactions.toString().padStart(6)} transactions`));
  console.log(createBoxLine(`📊 Total Transactions: ${totalTransactions.toString().padStart(5)} transactions`));
  console.log(createBoxLine(`💰 Daily Volume: $${formatUSDC(dailyVolumeAmount).padStart(10)} USDC`));
  console.log(createBoxLine(`💎 Total Volume: $${formatUSDC(totalVolumeAmount).padStart(10)} USDC`));
  console.log("╠" + "═".repeat(boxWidth - 2) + "╣");
  console.log(createBoxLine("🔗 Chain: Base Network"));
  console.log(createBoxLine("📅 Deployment: Aug 30, 2025"));
  console.log(createBoxLine("⚡ Status: Active & Operational"));
  console.log("╚" + "═".repeat(boxWidth - 2) + "╝");

  return {
    dailyVolume,
    totalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-08-30", // Start from August 30, 2025 (deployment date)
    },
  },
  methodology: {
    Volume: "Daily Volume = Rebalanced events + Withdrawal events for the requested time period. Total Volume = All Rebalanced events (globally, all history from Aug 30, 2025) + All Withdrawal events (from vaults, all history) + Initial Deposit Amounts (from all vaults). DEPOSIT events are tracked but filtered out and NOT included in volume to avoid double-counting. Uses dynamic vault discovery via UserVaultTracker from factory contract 0x1D283b668F947E03E8ac8ce8DA5505020434ea0E on Base chain. Transaction counts are logged for debugging but not returned as metrics since they are not supported by the framework.",
  },
};

export default adapter;