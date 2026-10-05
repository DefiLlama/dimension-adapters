import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPositionedLogArgs } from "../../helpers/logs";

// PeddleQuest contracts: immutable, no proxies, deployed from the same deployer
// nonce so the addresses are identical on Base, BSC, Robinhood Chain and Arc.
// Source verified on Sourcify (exact match) on every chain.
// https://basescan.org/address/0x16267bE6D067b3d411bf779B5aD041f9eba4CadE
const ESCROW = "0x16267bE6D067b3d411bf779B5aD041f9eba4CadE"; // PeddlesQuestEscrow: reward pools
const MARKET = "0x704E5eA6752EbfcEDB377512b67c0138461f4849"; // PeddlesPromotionMarket: trending / banner slots
const BADGE = "0x6DA219d4072A91665F702e34ca6CcaCd3eA7AE91"; // PeddlesQuestBadge: completion badges

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Escrow: `_accrue` is the only writer of the treasury's pending balance and
// always emits TreasuryAccrued. It is called from exactly three places, each
// followed in the same call by the event that identifies it:
//   createQuest   -> [TreasuryAccrued(gas token, creation fee)] [TreasuryAccrued(reward token, deposit fee)] QuestCreated
//   sweepExpired  -> [TreasuryAccrued(reward token, treasury share)] QuestSwept
const ESCROW_ACCRUED = "event TreasuryAccrued(address indexed asset, uint256 amount, uint256 pending)";
const QUEST_CREATED = "event QuestCreated(bytes32 indexed questId, address indexed creator, address indexed rewardToken, uint256 gross, uint256 funded, uint256 fee, uint64 claimDeadline)";
const QUEST_SWEPT = "event QuestSwept(bytes32 indexed questId, uint256 toCreator, uint256 toTreasury)";
// Market and badge fees are always paid in the chain's gas token.
const MARKET_ACCRUED = "event TreasuryAccrued(uint256 amount, uint256 pending)";
const BADGE_ACCRUED = "event FeeAccrued(uint256 treasuryAmount, uint256 flywheelAmount)";

const LABELS = {
  CREATION: "Quest Creation Fees",
  DEPOSIT: "Reward Pool Deposit Fees",
  UNCLAIMED: "Unclaimed Rewards Share",
  PROMOTION: "Promotion Slot Fees",
  BADGE: "Badge Mint Fees",
};
const toTreasury = (label: string) => `${label} To Treasury`;
const BADGE_TO_BUYBACK = "Badge Mint Fees To Buyback And Burn";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // address(0) is the chain's gas token: ETH, BNB, or USDC on Arc.
  const addTreasuryFee = (asset: string, amount: any, label: string) => {
    if (asset.toLowerCase() === ZERO_ADDRESS) {
      dailyFees.addGasToken(amount, label);
      dailyRevenue.addGasToken(amount, toTreasury(label));
      dailyProtocolRevenue.addGasToken(amount, toTreasury(label));
    } else {
      dailyFees.add(asset, amount, label);
      dailyRevenue.add(asset, amount, toTreasury(label));
      dailyProtocolRevenue.add(asset, amount, toTreasury(label));
    }
  };

  const accrued = await getPositionedLogArgs(options, { target: ESCROW, eventAbi: ESCROW_ACCRUED });
  const created = await getPositionedLogArgs(options, { target: ESCROW, eventAbi: QUEST_CREATED });
  const swept = await getPositionedLogArgs(options, { target: ESCROW, eventAbi: QUEST_SWEPT });
  const escrowLogs: any[] = [
    ...accrued.map((log) => ({ ...log, kind: "accrued" })),
    ...created.map((log) => ({ ...log, kind: "created" })),
    ...swept.map((log) => ({ ...log, kind: "swept" })),
  ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  let pending: any[] = [];
  for (const log of escrowLogs) {
    if (log.kind === "accrued") {
      pending.push(log);
    } else if (log.kind === "created") {
      // The deposit fee, when charged, is the accrual right before QuestCreated;
      // anything before it is the flat creation fee.
      if (BigInt(log.fee) > 0n) {
        const deposit = pending.pop();
        if (!deposit || BigInt(deposit.amount) !== BigInt(log.fee))
          throw new Error(`peddlequest: QuestCreated at ${log.blockNumber}:${log.logIndex} has no matching deposit-fee accrual`);
        addTreasuryFee(deposit.asset, deposit.amount, LABELS.DEPOSIT);
      }
      pending.forEach((fee) => addTreasuryFee(fee.asset, fee.amount, LABELS.CREATION));
      pending = [];
    } else {
      pending.forEach((share) => addTreasuryFee(share.asset, share.amount, LABELS.UNCLAIMED));
      pending = [];
    }
  }
  if (pending.length)
    throw new Error(`peddlequest: ${pending.length} TreasuryAccrued log(s) without their QuestCreated/QuestSwept on ${options.chain}`);

  const marketLogs = await options.getLogs({ target: MARKET, eventAbi: MARKET_ACCRUED });
  marketLogs.forEach((log) => addTreasuryFee(ZERO_ADDRESS, log.amount, LABELS.PROMOTION));

  // The badge splits each mint fee on-chain, at accrual, between the treasury
  // and the fee router's buyback-and-burn address (0 while that route is off).
  const badgeLogs = await options.getLogs({ target: BADGE, eventAbi: BADGE_ACCRUED });
  badgeLogs.forEach((log) => {
    addTreasuryFee(ZERO_ADDRESS, log.treasuryAmount, LABELS.BADGE);
    dailyFees.addGasToken(log.flywheelAmount, LABELS.BADGE);
    dailyRevenue.addGasToken(log.flywheelAmount, BADGE_TO_BUYBACK);
    dailyHoldersRevenue.addGasToken(log.flywheelAmount, BADGE_TO_BUYBACK);
  });

  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "Everything PeddleQuest charges: the fee quest creators pay on top of the reward pool they deposit, the flat quest creation fee, the protocol's share of rewards that winners did not claim before the deadline, payments for trending and banner promotion slots, and the fee users pay to mint an optional completion badge.",
  UserFees: "Same as Fees: all of it is paid by quest creators, advertisers and badge minters. Joining a quest and claiming a reward are free.",
  Revenue: "All fees are kept by the protocol. Quest rewards themselves go to winners and are not counted as fees or revenue.",
  ProtocolRevenue: "Fees accrued to the protocol treasury (a Safe multisig).",
  HoldersRevenue: "The share of badge mint fees routed on-chain to buyback and burn. Zero while that route is switched off, which it has been since launch.",
};

const feeSources = {
  [LABELS.DEPOSIT]: "Percentage fee (3% at launch, hard-capped at 10%) charged on top of each reward pool when a quest creator deposits it into escrow.",
  [LABELS.CREATION]: "Flat fee per quest paid by the creator in the chain's gas token (free at launch).",
  [LABELS.UNCLAIMED]: "The protocol's share (20% at launch, hard-capped at 50%) of rewards winners left unclaimed after the claim deadline; the rest returns to the quest creator.",
  [LABELS.PROMOTION]: "Payments by advertisers for trending and banner slots, priced per day in the chain's gas token.",
  [LABELS.BADGE]: "Fee paid by a user who chooses to mint the optional soulbound badge for a quest they completed.",
};
const treasuryDestinations = Object.fromEntries(
  Object.entries(feeSources).map(([label, text]) => [toTreasury(label), `Sent to the protocol treasury. ${text}`]),
);
const buybackDestination = {
  [BADGE_TO_BUYBACK]: "The share of badge mint fees the on-chain fee router sends to its buyback-and-burn address. Zero while that route is switched off.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE, CHAIN.BSC, CHAIN.ROBINHOOD, CHAIN.ARC],
  start: "2026-10-02", // all four chains were deployed that day
  methodology,
  breakdownMethodology: {
    Fees: feeSources,
    UserFees: feeSources,
    Revenue: { ...treasuryDestinations, ...buybackDestination },
    ProtocolRevenue: treasuryDestinations,
    HoldersRevenue: buybackDestination,
  },
};

export default adapter;
