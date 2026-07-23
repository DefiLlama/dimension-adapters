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
// Settlement math (GridMining._calculateSettlementFees, all divisions floor):
//   losersPool     = totalDeployed - winnersDeployed
//   adminFee       = totalDeployed × 1%
//   losersAdmin    = losersPool × 1%
//   vaultAmount    = (losersPool - losersAdmin) × 10%
//   totalWinnings  = (losersPool - losersAdmin) - vaultAmount
//
// So totalWinnings ≈ losersPool × 8910 / 10000, which lets us derive losersPool
// (and from it the admin fees) from the RoundSettled event. The derivation
// replays the contract's sequential integer divisions to stay wei-exact.
//
// Rounds where nobody deployed to the winning block settle via a separate path
// (GridMining._settleNoWinners): the ENTIRE pot minus the 1% admin fee is
// routed to the Treasury and RoundSettled is emitted with all-zero amounts.
// Both events emit in the same settlement transaction, so those rounds' admin
// fees are recovered by pairing RoundSettled with the VaultReceived of the
// same transaction (vault = totalDeployed - adminFee → adminFee = vault/99).

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GRID_MINING = '0x46D5459F439E64B8CC2D02e89b137608eA5711CE';
const TREASURY = '0x78Df583557baa1b9C8b8839BeCAAe2eD665Bd7e6';

// GridMining fee constants (basis points, matching contract)
const ADMIN_FEE_BPS = 100n;   // 1% of totalDeployed
const VAULT_FEE_BPS = 1000n;  // 10% of losersPool after admin
const BPS = 10000n;
const TOKEN_STAKER_SHARE = 0.05

// Replay of GridMining._calculateSettlementFees for a given losersPool,
// using the contract's sequential floor divisions.
const winningsFor = (losersPool: bigint): bigint => {
  const losersAdmin = losersPool * ADMIN_FEE_BPS / BPS;
  const afterAdmin = losersPool - losersAdmin;
  const vaultAmount = afterAdmin * VAULT_FEE_BPS / BPS;
  return afterAdmin - vaultAmount;
};

// Invert totalWinnings -> losersPool. Start from the closed-form candidate,
// then adjust within the flooring error so the contract's sequential math
// reproduces the emitted totalWinnings exactly.
const deriveLosersPool = (totalWinnings: bigint): bigint => {
  const candidate = totalWinnings * BPS * BPS / ((BPS - ADMIN_FEE_BPS) * (BPS - VAULT_FEE_BPS));
  for (let offset = -3n; offset <= 3n; offset++) {
    const pool = candidate + offset;
    if (pool >= 0n && winningsFor(pool) === totalWinnings) return pool;
  }
  return candidate;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // VaultReceived gives the exact ETH routed to the Treasury per settlement
  // (10% vault fee on normal rounds; full pot minus admin on no-winner rounds)
  const vaultLogs = await options.getLogs({
    target: TREASURY,
    eventAbi: 'event VaultReceived(uint256 amount, uint256 totalVaulted)',
    entireLog: true,
    parseLog: true,
  });

  // One settlement per transaction -> map tx to its vault amount so no-winner
  // rounds can recover their admin fee below
  const vaultByTx = new Map<string, bigint>();
  for (const log of vaultLogs as any[]) {
    const amount = BigInt(log.args.amount);
    dailyFees.addGasToken(amount, 'Vault fees');
    dailyHoldersRevenue.addGasToken(Number(amount) * TOKEN_STAKER_SHARE, 'Vault Fees to Stakers');
    dailyHoldersRevenue.addGasToken(Number(amount) * (1 - TOKEN_STAKER_SHARE), 'Vault Fees to Burn');
    vaultByTx.set(log.transactionHash.toLowerCase(), amount);
  }

  // RoundSettled gives totalWinnings + winnersDeployed to derive admin fees
  const roundLogs = await options.getLogs({
    target: GRID_MINING,
    eventAbi: 'event RoundSettled(uint64 indexed roundId, uint8 winningBlock, address topMiner, uint256 totalWinnings, uint256 topMinerReward, uint256 peapotAmount, bool isSplit, uint256 topMinerSeed, uint256 winnersDeployed)',
    entireLog: true,
    parseLog: true,
  });

  for (const log of roundLogs as any[]) {
    const totalWinnings = BigInt(log.args.totalWinnings);
    const winnersDeployed = BigInt(log.args.winnersDeployed);

    let totalAdminFees: bigint;
    if (totalWinnings > 0n) {
      // Normal round: 1% on totalDeployed + 1% on losersPool
      const losersPool = deriveLosersPool(totalWinnings);
      const totalDeployed = losersPool + winnersDeployed;
      totalAdminFees = totalDeployed * ADMIN_FEE_BPS / BPS + losersPool * ADMIN_FEE_BPS / BPS;
    } else if (winnersDeployed > 0n) {
      // Everyone deployed on the winning block: losersPool = 0, base admin fee only
      totalAdminFees = winnersDeployed * ADMIN_FEE_BPS / BPS;
    } else {
      // No-winner round: vault = totalDeployed - adminFee, so adminFee = vault × 1/99
      const vaultAmount = vaultByTx.get(log.transactionHash.toLowerCase()) ?? 0n;
      totalAdminFees = vaultAmount * ADMIN_FEE_BPS / (BPS - ADMIN_FEE_BPS);
    }

    dailyFees.addGasToken(totalAdminFees, 'Admin fees');
    dailyProtocolRevenue.addGasToken(totalAdminFees, 'Admin fees');
  }

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
  Revenue: 'All extracted fees: the sum of protocol revenue (admin fees) and holders revenue (vault fees).',
  ProtocolRevenue: 'Admin fees (1% of deployed ETH + 1% of losers pool) accruing to the protocol fee wallet.',
  HoldersRevenue: 'Vault fee ETH funds automated PEA buybacks — 95% of bought PEA is permanently burned, 5% is distributed to PEA stakers as yield.',
};

const breakdownMethodology = {
  Fees: {
    'Vault fees': 'ETH routed to the Treasury vault at settlement (10% of losers pool after admin on normal rounds; the full pot minus admin on no-winner rounds), tracked via VaultReceived events.',
    'Admin fees': 'Admin fees (1% of deployed ETH + 1% of losers pool) derived from RoundSettled events, with no-winner rounds recovered from their paired VaultReceived amount.',
  },
  UserFees: {
    'Vault fees': 'Vault fee portion of the fees paid by players out of their deployed ETH.',
    'Admin fees': 'Admin fee portion of the fees paid by players out of their deployed ETH.',
  },
  Revenue: {
    'Vault fees': 'Holders revenue portion: vault fee ETH funding PEA buybacks.',
    'Admin fees': 'Protocol revenue portion: admin fees accruing to the protocol fee wallet.',
  },
  ProtocolRevenue: {
    'Admin fees': 'Admin fees accruing to the protocol fee wallet.',
  },
  HoldersRevenue: {
    'Vault Fees to Stakers': '5% of the vault fees are used to buy PEA and distributed to PEA stakers.',
    'Vault Fees to Burn': '95% of the vault fees are used to buy PEA and burned.',
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-07-21',
};

export default adapter;
