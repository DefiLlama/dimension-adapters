import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// MING on BSC: https://ming.family
const GRID_MINING = '0x50518bfb43d526F0342459cF92CB0AeC25D38Fd9';
const AUTO_MINER = '0x0a570E5Ac33118f36c9B0AC7bFFCAB6bde57c308';
const TREASURY = '0x427992090a24122Df5b77b5cC259804af7Ad8844';
const XAUT = '0x21cAef8A43163Eea865baeE23b9C2E327696A3bf';

// Constants in GridMining (ADMIN_FEE_BPS, VAULT_FEE_BPS, GOLDPOT_SHARE_BPS), fixed since launch
const BPS = 10000n;
const DEPLOY_FEE_BPS = 100n;     // 1% of all BNB deployed in a round
const ROUND_FEE_BPS = 1000n;     // 10% of the BNB on tiles not drawn, after the 1%
const GOLDPOT_SHARE_BPS = 1000n; // 10% of the round fee buys gold for the Goldpot

const LABELS = {
  DEPLOY_FEES: 'Deploy Fees',
  ROUND_FEES: 'Round Fees',
  AUTOMINER_FEES: 'AutoMiner Fees',
  DEPLOY_FEES_TO_PROTOCOL: 'Deploy Fees To Protocol',
  ROUND_FEES_TO_TREASURY: 'Round Fees To Treasury',
  ROUND_FEES_TO_GOLDPOT: 'Round Fees To Goldpot',
  AUTOMINER_FEES_TO_PROTOCOL: 'AutoMiner Fees To Protocol',
  GOLD_TO_STAKERS: 'Gold To MING Stakers',
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Round fees are taken when a round settles; the round's totals are read from GridMining
  const settled = await options.getLogs({
    target: GRID_MINING,
    eventAbi: 'event RoundSettled(uint64 indexed roundId, uint8 winningBlock, address topMiner, uint256 totalWinnings, uint256 topMinerReward, uint256 goldpotAmount, bool isSplit, uint256 topMinerSeed, uint256 winnersDeployed)',
  });
  const rounds = await options.api.multiCall({
    target: GRID_MINING,
    abi: 'function rounds(uint64) view returns (uint256 startTime, uint256 endTime, uint256 totalDeployed, uint256 totalWinnings, uint256 winnersDeployed, uint8 winningBlock, address topMiner, uint256 topMinerReward, uint256 goldpotAmount, uint256 settlementRequestId, uint256 topMinerSeed, bool settled, uint256 minerCount)',
    calls: settled.map((log: any) => log.roundId.toString()),
  });

  for (const round of rounds) {
    const deployed = BigInt(round.totalDeployed);
    const onDrawnTile = BigInt(round.winnersDeployed);
    const deployFee = deployed * DEPLOY_FEE_BPS / BPS;
    let roundFee: bigint;
    if (onDrawnTile === 0n) {
      // No one on the drawn tile: everything after the deploy fee goes to the round fee
      roundFee = deployed - deployFee;
    } else {
      const notDrawn = deployed - onDrawnTile;
      roundFee = (notDrawn - notDrawn * DEPLOY_FEE_BPS / BPS) * ROUND_FEE_BPS / BPS;
    }
    const toGoldpot = roundFee * GOLDPOT_SHARE_BPS / BPS;

    dailyFees.addGasToken(deployFee, LABELS.DEPLOY_FEES);
    dailyFees.addGasToken(roundFee, LABELS.ROUND_FEES);
    dailySupplySideRevenue.addGasToken(toGoldpot, LABELS.ROUND_FEES_TO_GOLDPOT);
    dailyRevenue.addGasToken(deployFee, LABELS.DEPLOY_FEES_TO_PROTOCOL);
    dailyRevenue.addGasToken(roundFee - toGoldpot, LABELS.ROUND_FEES_TO_TREASURY);
    dailyProtocolRevenue.addGasToken(deployFee, LABELS.DEPLOY_FEES_TO_PROTOCOL);
  }

  const executions = await options.getLogs({
    target: AUTO_MINER,
    eventAbi: 'event ExecutedFor(address indexed user, uint64 indexed roundId, uint8[] blocks, uint256 totalDeployed, uint256 fee, uint256 roundsExecuted)',
  });
  for (const log of executions) {
    dailyFees.addGasToken(log.fee, LABELS.AUTOMINER_FEES);
    dailyRevenue.addGasToken(log.fee, LABELS.AUTOMINER_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.addGasToken(log.fee, LABELS.AUTOMINER_FEES_TO_PROTOCOL);
  }

  // The Treasury spends its share on MING buybacks, burned, and on gold for MING stakers, on its own schedule
  const buybacks = await options.getLogs({
    target: TREASURY,
    eventAbi: 'event BuybackExecuted(uint256 bnbSpent, uint256 mingBurned, bool viaPortal)',
  });
  for (const log of buybacks) dailyHoldersRevenue.addGasToken(log.bnbSpent, METRIC.TOKEN_BUY_BACK);

  const stakerGold = await options.getLogs({
    target: TREASURY,
    eventAbi: 'event StakerGoldPushed(uint256 goldOut, uint256 totalSoFar)',
  });
  for (const log of stakerGold) dailyHoldersRevenue.add(XAUT, log.goldOut, LABELS.GOLD_TO_STAKERS);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "BNB paid by players each round: 1% of all BNB deployed, 10% of the BNB on tiles not drawn, and AutoMiner fees.",
  UserFees: "All fees are paid by players: the 1% deploy fee, the round fee on tiles not drawn, and AutoMiner fees.",
  Revenue: "Player fees kept by the protocol: everything except the 10% of the round fee that buys gold for the Goldpot.",
  SupplySideRevenue: "10% of the round fee, which buys gold (XAUt) paid to players through the Goldpot.",
  ProtocolRevenue: "The 1% deploy fee and AutoMiner fees, kept by the protocol.",
  HoldersRevenue: "BNB spent buying back and burning MING, and gold (XAUt) sent to MING stakers.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.DEPLOY_FEES]: '1% of all BNB deployed each round.',
    [LABELS.ROUND_FEES]: "10% of the BNB on tiles not drawn, after the deploy fee (all of it when no one is on the drawn tile).",
    [LABELS.AUTOMINER_FEES]: 'Fee paid each round by players who let the AutoMiner deploy for them.',
  },
  Revenue: {
    [LABELS.DEPLOY_FEES_TO_PROTOCOL]: 'The 1% deploy fee, kept by the protocol.',
    [LABELS.ROUND_FEES_TO_TREASURY]: '90% of the round fee, sent to the Treasury for MING buybacks and gold for stakers.',
    [LABELS.AUTOMINER_FEES_TO_PROTOCOL]: 'AutoMiner fees, kept by the protocol.',
  },
  SupplySideRevenue: {
    [LABELS.ROUND_FEES_TO_GOLDPOT]: '10% of the round fee, which buys gold paid to players through the Goldpot.',
  },
  ProtocolRevenue: {
    [LABELS.DEPLOY_FEES_TO_PROTOCOL]: 'The 1% deploy fee, sent to the protocol after topping up the BNB that pays for round triggers.',
    [LABELS.AUTOMINER_FEES_TO_PROTOCOL]: 'AutoMiner fees, sent to the protocol after topping up the BNB that pays for AutoMiner triggers.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'BNB spent buying MING on PancakeSwap. All MING bought is burned.',
    [LABELS.GOLD_TO_STAKERS]: "Gold (XAUt) bought with 1.11% of the Treasury's share and sent to the Staking contract for MING stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: '2026-11-05',
  methodology,
  breakdownMethodology,
};

export default adapter;
