import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/*
 * Mercury ($MRCY) — ORE/BEAN-style on-chain mining game on HyperEVM (chain 999).
 *
 * Players "deploy" native HYPE onto a 5x5 grid each ~50s round. One block wins
 * the pot; the protocol takes two HYPE fees, both derivable from on-chain events:
 *
 *   1. Admin fee — 1% of every HYPE deployed, skimmed at deploy time
 *      (GridMining._deploy: adminFee = value * 100 / 10000). Sent to the dev/ops
 *      treasury (team multisig). -> Protocol revenue.
 *   2. Vault fee — 10% of the losers' pool, routed to the Treasury buyback at
 *      settle and emitted as Treasury.ReceivedVault(amount, ...). The buyback
 *      burns 90% of the bought MRCY and sends 10% to stakers, so this value
 *      accrues to MRCY holders. -> Holders revenue. (ReceivedVault also carries
 *      the admin rounding dust + the swept affiliate-escrow remainder; all of it
 *      is HYPE flowing to the buyback, i.e. holders.)
 *
 * Explicitly NOT counted:
 *   - The winners' pot — a player<->player redistribution, not protocol revenue.
 *   - The AutoMiner executor fee (0.8% + flat) — pays the keeper, not the protocol.
 *   - The $MRCY refining fee (10% on claim) — a pure holder<->holder redistribution
 *     (re-credited to other unclaimed holders via accRefiningPerUnclaimed: no
 *     protocol cut, no burn), so it is neither a fee nor revenue.
 *
 * Volume = total HYPE deployed into the game (gross, incl. the 1% admin fee) =
 * Σ Deployed.totalAmount + Σ DeployedFor.totalAmount (mutually exclusive: a
 * direct deploy emits Deployed, an AutoMiner deployFor emits DeployedFor).
 *
 * Event signatures mirror contracts/src/GridMining.sol + contracts/src/TreasuryV3.sol.
 */

// Mainnet contracts (HyperEVM, chain 999). Deployed 2026-06-16, block 37979317.
const GRID_MINING = "0xa406a36648E0ca782dD2fFdEb4E2Ac9893A1a436"; // GridMining
const TREASURY = "0x3a648289259b9F12B3678E79E6Fa85e7Ab982002"; // TreasuryV3 (emits ReceivedVault)

// Fee rate, from GridMining._deploy: adminFee = value * ADMIN_FEE_BPS / 10000.
const ADMIN_FEE_BPS = 100n; // 1% of gross HYPE deployed -> dev/ops treasury (team)
const BPS = 10_000n;
const VAULT_FEE_TO_BURN = 0.9;
const VAULT_FEE_TO_STAKERS = 0.1;

const DEPLOYED =
  "event Deployed(uint64 indexed roundId, address indexed user, uint256 amountPerBlock, uint32 blockMask, uint256 totalAmount)";
const DEPLOYED_FOR =
  "event DeployedFor(uint64 indexed roundId, address indexed user, address indexed executor, uint256 amountPerBlock, uint32 blockMask, uint256 totalAmount)";
const RECEIVED_VAULT = "event ReceivedVault(uint256 amount, uint256 newVaulted)";

// Breakdown labels (must each appear in breakdownMethodology below).
const ADMIN_FEE = "Admin Fee";
const VAULT_FEE = "Vault Fee";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // ── Volume + admin fee (1% of every HYPE deploy, user or AutoMiner) ──
  const deployed = await options.getLogs({ target: GRID_MINING, eventAbi: DEPLOYED });
  const deployedFor = await options.getLogs({ target: GRID_MINING, eventAbi: DEPLOYED_FOR });
  for (const log of [...deployed, ...deployedFor]) {
    const value = log.totalAmount; // gross HYPE sent (incl. the 1% admin fee)
    dailyVolume.addGasToken(value);
    const adminFee = (value * ADMIN_FEE_BPS) / BPS;
    dailyFees.addGasToken(adminFee, ADMIN_FEE);
    dailyProtocolRevenue.addGasToken(adminFee, ADMIN_FEE); // -> team treasury
  }

  // ── Vault fee: exact HYPE routed to the buyback at settle (-> holders) ──
  const vaultLogs = await options.getLogs({ target: TREASURY, eventAbi: RECEIVED_VAULT });
  for (const log of vaultLogs) {
    dailyFees.addGasToken(log.amount, VAULT_FEE);
    dailyHoldersRevenue.addGasToken(Number(log.amount) * VAULT_FEE_TO_STAKERS, 'Vault Fees to $MRCY Stakers');
    dailyHoldersRevenue.addGasToken(Number(log.amount) * VAULT_FEE_TO_BURN, 'Vault Fees to $MRCY Burn');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees, // all fees accrue to protocol (admin) + holders (buyback); no supply-side cut
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Volume:
    "Total native HYPE deployed into the mining game (gross, including the 1% admin fee), summed from the GridMining Deployed and DeployedFor events.",
  Fees: "The 1% admin fee on every HYPE deploy plus the vault fee (10% of the losers' pool, routed to the buyback). The winners' pot (player-to-player) and the $MRCY refining fee (a holder-to-holder redistribution with no protocol cut) are not counted.",
  Revenue: "All extracted fees: the admin fee accrues to the team treasury and the vault fee accrues to MRCY holders via the buyback. There is no LP/supply-side cut, so Revenue equals Fees.",
  ProtocolRevenue: "The 1% admin fee on HYPE deployed, sent to the dev/ops treasury (team multisig).",
  HoldersRevenue: "The vault fee (10% of the losers' pool) funds the on-chain buyback — 90% of the bought MRCY is burned and 10% is distributed to stakers.",
};

const breakdownMethodology = {
  Fees: {
    [ADMIN_FEE]: "1% admin fee skimmed from every HYPE deploy.",
    [VAULT_FEE]: "10% vault fee on the losers' pool, routed to the buyback at round settle.",
  },
  Revenue: {
    [ADMIN_FEE]: "Admin fee kept by the protocol (team treasury).",
    [VAULT_FEE]: "Vault fee spent on the MRCY buyback (accrues to holders).",
  },
  ProtocolRevenue: {
    [ADMIN_FEE]: "1% admin fee sent to the dev/ops treasury (team multisig).",
  },
  HoldersRevenue: {
    'Vault Fees to $MRCY Stakers': "10% of the 10% vault fee on the losers' pool, routed to the buyback and distribution to stakers at round settle.",
    'Vault Fees to $MRCY Burn': "90% of the 10% vault fee on the losers' pool, routed to the buyback and burn at round settle.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-06-16", // GridMining mainnet deploy (block 37979317, 2026-06-16T12:15Z)
  pullHourly: true, // ~1700 rounds/day: chunk log queries hourly
  methodology,
  breakdownMethodology,
};

export default adapter;
