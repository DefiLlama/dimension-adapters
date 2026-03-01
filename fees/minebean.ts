import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GRID_MINING = '0x9632495bDb93FD6B0740Ab69cc6c71C9c01da4f0';
const TREASURY = '0x38F6E74148D6904286131e190d879A699fE3Aeb3';

// GridMining fee constants (basis points, matching contract)
const ADMIN_FEE_BPS = 100n;   // 1% of totalDeployed
const VAULT_FEE_BPS = 1000n;  // 10% of losersPool after admin
const BPS = 10000n;

// Settlement math (from GridMining._calculateSettlementFees):
//   adminFee       = totalDeployed × 1%
//   losersPool     = totalDeployed - winnersDeployed
//   losersAdmin    = losersPool × 1%
//   vaultAmount    = (losersPool - losersAdmin) × 10%
//   totalWinnings  = (losersPool - losersAdmin) - vaultAmount
//
// So totalWinnings = losersPool × 0.99 × 0.9 = losersPool × 8910 / 10000
// We can derive losersPool from totalWinnings, then calculate all fees.

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // VaultReceived gives exact vault fee per round (no derivation needed)
  const vaultLogs = await options.getLogs({
    target: TREASURY,
    eventAbi: 'event VaultReceived(uint256 amount, uint256 vaultedETH)',
  });

  vaultLogs.forEach(log => {
    dailyFees.addGasToken(log.amount);
    dailyHoldersRevenue.addGasToken(log.amount);
  });

  // RoundSettled gives totalWinnings + winnersDeployed to derive admin fees
  const roundLogs = await options.getLogs({
    target: GRID_MINING,
    eventAbi: 'event RoundSettled(uint64 indexed roundId, uint8 winningBlock, address topMiner, uint256 totalWinnings, uint256 topMinerReward, uint256 beanpotAmount, bool isSplit, uint256 topMinerSeed, uint256 winnersDeployed)',
  });

  roundLogs.forEach(log => {
    const totalWinnings = log.totalWinnings;
    const winnersDeployed = log.winnersDeployed;

    // Derive losersPool: totalWinnings = losersPool × (BPS - ADMIN) / BPS × (BPS - VAULT) / BPS
    // = losersPool × 9900 × 9000 / 10000^2 = losersPool × 8910 / 10000
    const losersPool = totalWinnings > 0n
      ? totalWinnings * BPS * BPS / ((BPS - ADMIN_FEE_BPS) * (BPS - VAULT_FEE_BPS))
      : 0n;
    const totalDeployed = losersPool + winnersDeployed;

    // Admin fees: 1% on totalDeployed + 1% on losersPool
    const adminFee = totalDeployed * ADMIN_FEE_BPS / BPS;
    const losersAdminFee = losersPool * ADMIN_FEE_BPS / BPS;
    const totalAdminFees = adminFee + losersAdminFee;

    dailyFees.addGasToken(totalAdminFees);
    dailyProtocolRevenue.addGasToken(totalAdminFees);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: 'Fees extracted per round: 1% admin fee on totalDeployed, 1% admin fee on losers pool, and 10% vault fee on losers pool after admin. Variable effective rate depending on winner/loser ratio.',
  Revenue: 'All extracted fees (admin + vault) are protocol revenue.',
  ProtocolRevenue: 'Admin fees (1% of totalDeployed + 1% of losers pool) sent to feeCollector wallet for protocol operations.',
  HoldersRevenue: 'Vault fee (10% of losers pool after admin) funds automated BEAN buybacks — 90% burned, 10% distributed to BEAN stakers.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2026-02-25',
    },
  },
  methodology,
};

export default adapter;
