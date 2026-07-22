// MinePea — fees & revenue adapter.
//
// MinePea is a gamified mining protocol on Robinhood Chain (chainId 4663).
// Players compete in continuous 60-second rounds, deploying ETH to a 5x5 grid;
// a verifiably random winning block is drawn each round and the winners split
// the losers' pool (in ETH) plus freshly mined PEA.
//
// Contracts (Robinhood Chain):
//   GridMining: 0x46D5459F439E64B8CC2D02e89b137608eA5711CE
//   Treasury:   0x78Df583557baa1b9C8b8839BeCAAe2eD665Bd7e6
//
// Settlement math (GridMining._calculateSettlementFees):
//   losersPool     = totalDeployed - winnersDeployed
//   adminFee       = totalDeployed × 1%
//   losersAdmin    = losersPool × 1%
//   vaultAmount    = (losersPool - losersAdmin) × 10%
//   totalWinnings  = (losersPool - losersAdmin) - vaultAmount
//
// So totalWinnings = losersPool × 0.99 × 0.9 = losersPool × 8910 / 10000,
// which lets us derive losersPool (and from it the admin fees) from the
// RoundSettled event alone.
//
// Rounds where nobody deployed to the winning block settle via a separate
// path: the ENTIRE pot minus the 1% admin fee is routed to the Treasury and
// RoundSettled is emitted with totalWinnings = 0. That vault transfer is fully
// captured by VaultReceived below; only the 1% admin fee of those rounds is
// left uncounted (conservative undercount, avoids per-tx log matching).

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GRID_MINING = '0x46D5459F439E64B8CC2D02e89b137608eA5711CE';
const TREASURY = '0x78Df583557baa1b9C8b8839BeCAAe2eD665Bd7e6';

// GridMining fee constants (basis points, matching contract)
const ADMIN_FEE_BPS = 100n;   // 1% of totalDeployed
const VAULT_FEE_BPS = 1000n;  // 10% of losersPool after admin
const BPS = 10000n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // VaultReceived gives the exact ETH routed to the Treasury per settlement
  // (10% vault fee on normal rounds; full pot minus admin on no-winner rounds)
  const vaultLogs = await options.getLogs({
    target: TREASURY,
    eventAbi: 'event VaultReceived(uint256 amount, uint256 totalVaulted)',
  });

  vaultLogs.forEach((log: any) => {
    dailyFees.addGasToken(log.amount, 'Vault fees');
    dailyHoldersRevenue.addGasToken(log.amount, 'Vault fees');
  });

  // RoundSettled gives totalWinnings + winnersDeployed to derive admin fees
  const roundLogs = await options.getLogs({
    target: GRID_MINING,
    eventAbi: 'event RoundSettled(uint64 indexed roundId, uint8 winningBlock, address topMiner, uint256 totalWinnings, uint256 topMinerReward, uint256 peapotAmount, bool isSplit, uint256 topMinerSeed, uint256 winnersDeployed)',
  });

  roundLogs.forEach((log: any) => {
    const totalWinnings = log.totalWinnings;
    const winnersDeployed = log.winnersDeployed;

    // Derive losersPool: totalWinnings = losersPool × (BPS - ADMIN) / BPS × (BPS - VAULT) / BPS
    const losersPool = totalWinnings > 0n
      ? totalWinnings * BPS * BPS / ((BPS - ADMIN_FEE_BPS) * (BPS - VAULT_FEE_BPS))
      : 0n;
    const totalDeployed = losersPool + winnersDeployed;

    // Admin fees: 1% on totalDeployed + 1% on losersPool
    const adminFee = totalDeployed * ADMIN_FEE_BPS / BPS;
    const losersAdminFee = losersPool * ADMIN_FEE_BPS / BPS;
    const totalAdminFees = adminFee + losersAdminFee;

    dailyFees.addGasToken(totalAdminFees, 'Admin fees');
    dailyProtocolRevenue.addGasToken(totalAdminFees, 'Admin fees');
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
  Fees: 'Fees extracted per round: 1% admin fee on all deployed ETH, 1% admin fee on the losers pool, and a 10% vault fee on the losers pool after admin. On rounds where nobody hit the winning block, the entire pot (minus the admin fee) is routed to the Treasury vault. Variable effective rate depending on winner/loser ratio.',
  UserFees: 'Same as Fees — all fees are paid by players out of their deployed ETH.',
  Revenue: 'All extracted fees (admin + vault) are protocol revenue.',
  ProtocolRevenue: 'Admin fees (1% of deployed ETH + 1% of losers pool) sent to the feeCollector wallet for protocol operations.',
  HoldersRevenue: 'Vault fee ETH funds automated PEA buybacks — 95% of bought PEA is permanently burned, 5% is distributed to PEA stakers as yield.',
};

const breakdownMethodology = {
  Fees: {
    'Vault fees': 'ETH routed to the Treasury vault at settlement (10% of losers pool after admin on normal rounds; the full pot minus admin on no-winner rounds), tracked via VaultReceived events.',
    'Admin fees': 'Admin fees (1% of deployed ETH + 1% of losers pool) derived from RoundSettled events.',
  },
  ProtocolRevenue: {
    'Admin fees': 'Admin fees sent to the feeCollector wallet.',
  },
  HoldersRevenue: {
    'Vault fees': 'Treasury vault ETH spent on PEA buybacks: 95% burned, 5% to stakers.',
  },
};

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-07-21',
};

export default adapter;
