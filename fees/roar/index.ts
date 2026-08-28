import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Canonical Robinhood mainnet generation from Roar's production deployment manifest.
// Production lineage starts at block 23,394,472; the Game was created at
// block 23,394,511 and its canonical AutoMiner at block 23,394,788.
const GAME = "0xB9E308C0de769aB61089Ef47231f0ff92AE8BF69";
const AUTO_MINER = "0x451e9b91447bE0abeebD3110b8c372988383f72C";
const TREASURY = "0x809e60F2C2556b5B70A372BCE6F7300f8F216f24";
const ROAR = "0xf1d3e39cc61Aedd53dc40d8AFFf6aA1dD51875D0";
const WETH = ADDRESSES.robinhood.WETH;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";
const BPS = 10_000n;
// Immutable RoarTreasury split from the production deployment manifest.
const STAKER_SHARE_BPS = 1_000n;

const MINING_DEPLOYMENTS = "Mining Deployments";
const ROUND_ADMIN_FEES = "Round Admin Fees";
const TREASURY_VAULT_FEES = "Treasury Vault Fees";
const EARLY_CLAIM_FEES = "Early Claim Fees";
const AUTO_MINER_EXECUTION_FEES = "AutoMiner Execution Fees";

const ADMIN_FEES_TO_PROTOCOL = "Round Admin Fees to Protocol";
const AUTO_MINER_FEES_TO_EXECUTORS = "AutoMiner Execution Fees to Executors";
const TREASURY_FEES_TO_BUYBACKS = "Treasury Vault Fees to Buybacks";
const TREASURY_FEES_TO_BURN = "Treasury Vault Fees to ROAR Burn";
const TREASURY_FEES_TO_STAKERS = "Treasury Vault Fees to ROAR Stakers";
const EARLY_CLAIM_FEES_TO_DEAD_ADDRESS = "Early Claim Fees to Dead Address";
const EARLY_CLAIM_FEES_TO_PROTOCOL = "Early Claim Fees to Protocol";

const DEPLOYED =
  "event Deployed(uint256 indexed roundId, address indexed miner, uint256 settlementPerSquare, uint32 mask, uint256 totalSettlement)";
const ROUND_SETTLED =
  "event RoundSettled(uint256 indexed roundId, uint8 indexed winningSquare, bool splitReward, bool motherlodeHit, address soloWinner, uint256 totalSettlementDeployed, uint256 treasurySettlement, uint256 totalSettlementRewards, uint256 rewardAmount, uint256 motherlodePayout)";
const ROUND_CLAIMED =
  "event RoundClaimed(uint256 indexed roundId, address indexed miner, address indexed settlementRecipient, address rewardRecipient, uint256 grossSettlement, uint256 grossReward, uint256 earlyClaimFee, address earlyClaimFeeRecipient, uint256 netReward)";
const EXECUTED =
  "event Executed(address indexed user, address indexed executor, uint256 indexed roundId, uint32 mask, uint256 settlementSpent, uint256 executorFee)";
const VAULTED = "event Vaulted(uint256 settlementAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const deploymentLogs = await options.getLogs({
    target: GAME,
    eventAbi: DEPLOYED,
  });

  // Both direct deployments and deployments made by AutoMiner emit this same event.
  for (const log of deploymentLogs) {
    dailyVolume.add(WETH, log.totalSettlement, MINING_DEPLOYMENTS);
  }

  const settlementLogs = await options.getLogs({
    target: GAME,
    eventAbi: ROUND_SETTLED,
  });

  for (const log of settlementLogs) {
    const totalSettlementDeployed = BigInt(log.totalSettlementDeployed);
    const treasurySettlement = BigInt(log.treasurySettlement);
    const totalSettlementRewards = BigInt(log.totalSettlementRewards);

    // The event exposes every term of the settlement identity, so this remains exact
    // across pinned rule versions and the special no-winner settlement path.
    const adminSettlement =
      totalSettlementDeployed - treasurySettlement - totalSettlementRewards;

    dailyFees.add(WETH, adminSettlement, ROUND_ADMIN_FEES);
    dailyRevenue.add(WETH, adminSettlement, ADMIN_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.add(WETH, adminSettlement, ADMIN_FEES_TO_PROTOCOL);
  }

  const vaultLogs = await options.getLogs({
    target: TREASURY,
    eventAbi: VAULTED,
  });

  // Vaulted is emitted for both settlement treasury fees and final-claim WETH
  // rounding dust. Reading it at the destination captures both without duplication.
  for (const log of vaultLogs) {
    const settlementAmount = BigInt(log.settlementAmount);
    const toStakers = (settlementAmount * STAKER_SHARE_BPS) / BPS;
    const toBurn = settlementAmount - toStakers;
    dailyFees.add(WETH, settlementAmount, TREASURY_VAULT_FEES);
    dailyRevenue.add(WETH, settlementAmount, TREASURY_FEES_TO_BUYBACKS);
    dailyHoldersRevenue.add(WETH, toBurn, TREASURY_FEES_TO_BURN);
    dailyHoldersRevenue.add(WETH, toStakers, TREASURY_FEES_TO_STAKERS);
  }

  const claimLogs = await options.getLogs({
    target: GAME,
    eventAbi: ROUND_CLAIMED,
  });

  for (const log of claimLogs) {
    const earlyClaimFee = BigInt(log.earlyClaimFee);
    if (earlyClaimFee === 0n) continue;

    dailyFees.add(ROAR, earlyClaimFee, EARLY_CLAIM_FEES);
    dailyRevenue.add(
      ROAR,
      earlyClaimFee,
      log.earlyClaimFeeRecipient.toLowerCase() === DEAD_ADDRESS
        ? EARLY_CLAIM_FEES_TO_DEAD_ADDRESS
        : EARLY_CLAIM_FEES_TO_PROTOCOL
    );

    if (log.earlyClaimFeeRecipient.toLowerCase() === DEAD_ADDRESS) {
      dailyHoldersRevenue.add(
        ROAR,
        earlyClaimFee,
        EARLY_CLAIM_FEES_TO_DEAD_ADDRESS
      );
    } else {
      dailyProtocolRevenue.add(
        ROAR,
        earlyClaimFee,
        EARLY_CLAIM_FEES_TO_PROTOCOL
      );
    }
  }

  const executionLogs = await options.getLogs({
    target: AUTO_MINER,
    eventAbi: EXECUTED,
  });

  for (const log of executionLogs) {
    dailyFees.add(WETH, log.executorFee, AUTO_MINER_EXECUTION_FEES);
    dailySupplySideRevenue.add(
      WETH,
      log.executorFee,
      AUTO_MINER_FEES_TO_EXECUTORS
    );
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Volume:
    "Gross WETH deployed across the game grid, including both direct and AutoMiner deployments, taken from the Game's Deployed events.",
  Fees:
    "User-paid value from game activity: round admin WETH, WETH vaulted for treasury buybacks (including final-claim settlement rounding dust), ROAR charged for claiming mined rewards early, and AutoMiner execution fees paid to third-party executors.",
  UserFees:
    "Same as Fees. Round fees, treasury-vaulted settlement, and AutoMiner execution fees come from players' WETH, while early-claim fees are deducted from a claimant's ROAR reward.",
  Revenue:
    "Fees retained by Roar or accruing to ROAR holders through treasury buybacks and permanent dead-address transfers. AutoMiner execution fees are excluded from revenue because they are paid to third-party executors.",
  SupplySideRevenue:
    "AutoMiner execution fees paid to third-party executors for submitting users' configured deployments.",
  ProtocolRevenue:
    "Round admin fees allocated to the configured admin recipient, plus any early-claim fees sent to a non-dead-address recipient.",
  HoldersRevenue:
    "Treasury-vaulted WETH funds ROAR buybacks whose acquired tokens are burned and distributed to stakers. Early-claim ROAR sent to the dead address is also treated as holder revenue through permanent removal from circulation; that transfer does not reduce the token contract's totalSupply.",
};

const breakdownMethodology = {
  Volume: {
    [MINING_DEPLOYMENTS]:
      "Gross WETH deployed across all selected grid squares, including deployments submitted through AutoMiner.",
  },
  Fees: {
    [ROUND_ADMIN_FEES]:
      "The exact admin WETH retained at settlement: totalSettlementDeployed minus treasurySettlement minus totalSettlementRewards from each RoundSettled event.",
    [TREASURY_VAULT_FEES]:
      "The exact WETH received by the Roar treasury in Vaulted events: settlement treasury fees plus final-claim settlement rounding dust. On a no-winner round this includes all deployed WETH after the admin fee.",
    [EARLY_CLAIM_FEES]:
      "ROAR deducted from rewards claimed during a round's configured early-claim fee window, taken directly from RoundClaimed events.",
    [AUTO_MINER_EXECUTION_FEES]:
      "WETH execution fees charged from AutoMiner users' funded budgets and paid to third-party executors.",
  },
  UserFees: {
    [ROUND_ADMIN_FEES]:
      "Admin WETH paid from players' round deployments.",
    [TREASURY_VAULT_FEES]:
      "Settlement WETH retained from game rounds and sent to the treasury vault.",
    [EARLY_CLAIM_FEES]:
      "ROAR paid by winners who claim during the early-claim fee window.",
    [AUTO_MINER_EXECUTION_FEES]:
      "WETH paid by AutoMiner users for third-party execution of their configured deployments.",
  },
  SupplySideRevenue: {
    [AUTO_MINER_FEES_TO_EXECUTORS]:
      "AutoMiner execution fees passed through to the third-party executors that submit configured deployments.",
  },
  Revenue: {
    [ADMIN_FEES_TO_PROTOCOL]:
      "Round admin WETH allocated to the configured admin recipient.",
    [TREASURY_FEES_TO_BUYBACKS]:
      "Treasury-vaulted WETH reserved for ROAR buybacks, burns, and staking distributions.",
    [EARLY_CLAIM_FEES_TO_DEAD_ADDRESS]:
      "Early-claim ROAR transferred to the permanent dead address.",
    [EARLY_CLAIM_FEES_TO_PROTOCOL]:
      "Early-claim ROAR transferred to a configured recipient other than the dead address.",
  },
  ProtocolRevenue: {
    [ADMIN_FEES_TO_PROTOCOL]:
      "Round admin WETH allocated to the configured admin recipient.",
    [EARLY_CLAIM_FEES_TO_PROTOCOL]:
      "Early-claim ROAR transferred to a configured recipient other than the dead address.",
  },
  HoldersRevenue: {
    [TREASURY_FEES_TO_BURN]:
      "The 90% burn allocation of treasury-vaulted WETH. Bought ROAR is burned under the deployed treasury's immutable split.",
    [TREASURY_FEES_TO_STAKERS]:
      "The 10% staker allocation of treasury-vaulted WETH. Bought ROAR is distributed to ROAR stakers under the deployed treasury's immutable split.",
    [EARLY_CLAIM_FEES_TO_DEAD_ADDRESS]:
      "Early-claim ROAR permanently sent out of circulation to the dead address.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-30",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
