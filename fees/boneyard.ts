// Boneyard — fees & revenue adapter.
//
// Boneyard is a proof-of-work NFT collection on Arc (chain id 5042). Miners
// send Arc native USDC with a successful `mint` call. `Minted.price` is the
// exact protocol-set price that was accepted by the contract, so it is the
// authoritative fee source (rather than transaction value, which could include
// unrelated calls made by a smart-wallet transaction).
//
// Mainnet production deployment (2026-09-26, block 22,821,183):
//   Boneyard: 0xf3Da96f68b0F194144c008e58c23AC1A299c752c
//   Hook:     0x3c120F17B09fB68D994d3d99434ABBAad811CaC4
//   $BONE:    0x8cdDA76C9E2c6C7a63bAf13cE4D34a04B9b3a0Fb
//
// Accounting is accrual-based and only covers NFT mint fees. The hook also has
// a decaying swap levy, but its `afterSwap` path does not emit the collected
// levy amount; secondary royalties are paid directly to the immutable project
// receiver. Neither flow has a collection-specific fee event that can be
// independently and safely attributed here, so neither is included.
//
// Mint routing (all percentages are read from the deployed public constant
// getters below, not assumed from this file):
//   - mints #1–#8: 100% is hook-bound; 25% is project revenue and 75% is
//     locked-liquidity bootstrap. Charge does not accrue in genesis.
//   - mint #9 onward: 65% accrues as Charge to already-active Skeletons.
//     Of the remaining 35%, 25% is project revenue and 75% is either the
//     locked-liquidity bootstrap before LP activation, or the BONE buyback and
//     burn reserve after `LPSeeded`.
//
// DefiLlama classification follows fees/AGENTS.md:
//   - Charge is supply-side revenue because it accrues to active Skeletons.
//   - the project slice and pre-LP bootstrap are protocol revenue. The latter
//     remains protocol-controlled until Boneyard seeds its canonical liquidity.
//   - post-LP BONE buyback funding is holders revenue, booked when it is funded
//     rather than later when the capped buyback executes.
//   - BONE's genesis reserve and BONE minted on NFT burns are not priced or
//     counted: neither is a user-paid fee.

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const BONEYARD = "0xf3Da96f68b0F194144c008e58c23AC1A299c752c";
const HOOK = "0x3c120F17B09fB68D994d3d99434ABBAad811CaC4";
const BONEYARD_DEPLOY_BLOCK = 22_821_183;
const BONEYARD_DEPLOY_TIMESTAMP = 1_790_407_028;
const BPS = 10_000n;

const MINT_FEES = "Boneyard Mint Fees";
const CHARGE_TO_SKELETONS = "Mint Fees To Skeleton Charge";
const PROTOCOL_OWNED_LIQUIDITY_BOOTSTRAP = "Mint Fees To Protocol-Owned Liquidity Bootstrap";
const PROJECT_SHARE = "Mint Fees To Project";
const BONE_BUYBACK = "BONE Buyback Reserve";
const BOOTSTRAP_BUYBACK_RECLASSIFICATION = "Protocol-Owned Liquidity Bootstrap Reclassified To BONE Buyback";
const MINT_ROUNDING_REMAINDER = "Mint Rounding Remainder Retained In Boneyard";

const MINTED =
  "event Minted(uint256 indexed idx, address indexed miner, bytes32 work, uint256 nonce, uint256 price)";
const LP_SEEDED = "event LPSeeded(uint256 usdcAmount, uint256 boneAmount, uint256 timestamp)";
const PROJECT_SHARE_ADDED = "event ProjectShareAdded(uint256 amount)";
const BUYBACK_ACCRUAL_ADDED = "event BuybackAccrualAdded(uint256 amount)";
const BOOTSTRAP_DIVERTED_TO_BUYBACK = "event BootstrapDivertedToBuyback(uint256 amount)";

type EventLog = {
  args?: Record<string, unknown>;
  blockNumber?: bigint | number | string;
  logIndex?: bigint | number | string;
  transactionHash?: string;
  [key: string]: unknown;
};

const argsOf = (log: EventLog): Record<string, unknown> => log.args ?? log;
const asBigInt = (value: unknown): bigint => BigInt((value as { toString?: () => string })?.toString?.() ?? value as string);
const transactionKey = (log: EventLog) => String(log.transactionHash ?? "").toLowerCase();

const positionOf = (log: EventLog) => ({
  block: asBigInt(log.blockNumber ?? 0),
  index: asBigInt(log.logIndex ?? 0),
});

// LP can only be seeded once. A later transaction in the same block is already
// post-LP, so compare both block and log index rather than reading present-day
// `lpActive` for historical accounting.
const isAfterSeed = (log: EventLog, seed?: EventLog) => {
  if (!seed) return false;
  const current = positionOf(log);
  const seeded = positionOf(seed);
  return current.block > seeded.block || (current.block === seeded.block && current.index > seeded.index);
};

const sumAmounts = (logs: EventLog[]) =>
  logs.reduce((sum, log) => sum + asBigInt(argsOf(log).amount), 0n);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const result = {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };

  // Avoid calls to an address before its code existed in the first partial day.
  if (options.toTimestamp < BONEYARD_DEPLOY_TIMESTAMP) return result;

  const toBlock = await options.getToBlock();
  const [chargeShare, hookShareBps, hookProjectSplitBps, mintLogs, seedLogs, projectLogs, buybackLogs, divertedLogs] =
    await Promise.all([
      options.toApi.call({ target: BONEYARD, abi: "uint256:CHARGE_SHARE" }),
      options.toApi.call({ target: BONEYARD, abi: "uint256:HOOK_SHARE_BP" }),
      options.toApi.call({ target: BONEYARD, abi: "uint256:HOOK_PROJECT_SPLIT_BP" }),
      options.getLogs({ target: BONEYARD, eventAbi: MINTED, entireLog: true, parseLog: true }),
      // This one-shot event must be read from deployment through the end of the
      // current window so a post-seed day never mistakes buyback funding for LP
      // bootstrap. Cloud caching keeps the historical query negligible.
      options.getLogs({
        target: BONEYARD,
        eventAbi: LP_SEEDED,
        fromBlock: BONEYARD_DEPLOY_BLOCK,
        toBlock,
        entireLog: true,
        parseLog: true,
        cacheInCloud: true,
      }),
      options.getLogs({ target: HOOK, eventAbi: PROJECT_SHARE_ADDED, entireLog: true, parseLog: true }),
      options.getLogs({ target: HOOK, eventAbi: BUYBACK_ACCRUAL_ADDED, entireLog: true, parseLog: true }),
      options.getLogs({ target: BONEYARD, eventAbi: BOOTSTRAP_DIVERTED_TO_BUYBACK, entireLog: true, parseLog: true }),
    ]);

  const mints = mintLogs as EventLog[];
  const firstSeed = (seedLogs as EventLog[]).sort((a, b) => {
    const aPosition = positionOf(a);
    const bPosition = positionOf(b);
    if (aPosition.block !== bPosition.block) return aPosition.block < bPosition.block ? -1 : 1;
    return aPosition.index < bPosition.index ? -1 : aPosition.index > bPosition.index ? 1 : 0;
  })[0];

  const chargeBps = asBigInt(chargeShare) * 100n;
  const hookBps = asBigInt(hookShareBps);
  const projectBps = asBigInt(hookProjectSplitBps);

  let expectedProject = 0n;
  let expectedPostLpBuyback = 0n;
  let bootstrap = 0n;
  let charge = 0n;
  let roundingRemainder = 0n;
  const mintTransactions = new Set<string>();

  for (const mint of mints) {
    const args = argsOf(mint);
    const tokenId = asBigInt(args.idx);
    const price = asBigInt(args.price);
    const isGenesis = tokenId <= 8n;
    const hookShare = price * (isGenesis ? BPS : hookBps) / BPS;
    const projectShare = hookShare * projectBps / BPS;
    const buybackShare = hookShare - projectShare;
    const isPostLp = isAfterSeed(mint, firstSeed);

    dailyFees.addGasToken(price, MINT_FEES);
    mintTransactions.add(transactionKey(mint));
    expectedProject += projectShare;

    // The contract cannot have zero active Skeletons before a mint: it forbids
    // burning the most-recent token. Thus every #9+ mint has the 65% Charge path.
    if (!isGenesis) charge += price * chargeBps / BPS;

    // Solidity floors the Charge and hook calculations independently. The
    // deployed price table happens to leave one native wei unassigned for some
    // epoch-9 mints; it remains in Boneyard (not in Charge, the bootstrap, the
    // hook project accrual, or the buyback reserve). Keep it explicit so the
    // DefiLlama identity Fees = Revenue + SupplySideRevenue holds exactly.
    roundingRemainder += price - (isGenesis ? 0n : price * chargeBps / BPS) - hookShare;

    if (isPostLp) {
      expectedPostLpBuyback += buybackShare;
    } else {
      bootstrap += buybackShare;
    }
  }

  const actualProject = sumAmounts(
    (projectLogs as EventLog[]).filter((log) => mintTransactions.has(transactionKey(log))),
  );
  // BuybackAccrualAdded can also be emitted by seedLiquidity when an amount of
  // bootstrap could not fit the BONE reserve. It is not mint revenue for that
  // day, so retain only events from mint transactions and remove that explicit
  // BootstrapDivertedToBuyback amount in the (theoretically possible) same-tx
  // seed-plus-mint case.
  const actualPostLpBuyback = sumAmounts(
    (buybackLogs as EventLog[]).filter((log) => mintTransactions.has(transactionKey(log))),
  ) - sumAmounts(
    (divertedLogs as EventLog[]).filter((log) => mintTransactions.has(transactionKey(log))),
  );
  const bootstrapDivertedToBuyback = sumAmounts(divertedLogs as EventLog[]);

  // A successful mint must synchronously emit the Hook receipts. Failing loud
  // here protects against an ABI/provider mismatch instead of publishing a
  // silently reconstructed split that no longer matches the live contracts.
  if (actualProject !== expectedProject) {
    throw new Error(`Boneyard ProjectShareAdded mismatch: expected ${expectedProject}, got ${actualProject}`);
  }
  if (actualPostLpBuyback !== expectedPostLpBuyback) {
    throw new Error(`Boneyard BuybackAccrualAdded mismatch: expected ${expectedPostLpBuyback}, got ${actualPostLpBuyback}`);
  }

  if (charge > 0n) {
    dailySupplySideRevenue.addGasToken(charge, CHARGE_TO_SKELETONS);
  }
  if (bootstrap > 0n) {
    // No external LP receives this pre-seed balance. It is held by Boneyard
    // until owner-only seedLiquidity moves it into the canonical Hook position,
    // so it follows DefiLlama's protocol-owned-liquidity precedent.
    dailyRevenue.addGasToken(bootstrap, PROTOCOL_OWNED_LIQUIDITY_BOOTSTRAP);
    dailyProtocolRevenue.addGasToken(bootstrap, PROTOCOL_OWNED_LIQUIDITY_BOOTSTRAP);
  }
  if (actualProject > 0n) {
    dailyRevenue.addGasToken(actualProject, PROJECT_SHARE);
    dailyProtocolRevenue.addGasToken(actualProject, PROJECT_SHARE);
  }
  if (actualPostLpBuyback > 0n) {
    dailyRevenue.addGasToken(actualPostLpBuyback, BONE_BUYBACK);
    dailyHoldersRevenue.addGasToken(actualPostLpBuyback, BONE_BUYBACK);
  }
  if (bootstrapDivertedToBuyback > 0n) {
    // This is not new mint revenue: seedLiquidity has moved an amount that was
    // already booked as protocol-owned bootstrap into the Hook's BONE buyback
    // reserve. Reclassify it at the on-chain diversion event, preserving total
    // revenue while reporting the new BONE-holder value-accrual destination.
    dailyProtocolRevenue.addGasToken(-bootstrapDivertedToBuyback, BOOTSTRAP_BUYBACK_RECLASSIFICATION);
    dailyHoldersRevenue.addGasToken(bootstrapDivertedToBuyback, BOOTSTRAP_BUYBACK_RECLASSIFICATION);
  }
  if (roundingRemainder > 0n) {
    dailyRevenue.addGasToken(roundingRemainder, MINT_ROUNDING_REMAINDER);
    dailyProtocolRevenue.addGasToken(roundingRemainder, MINT_ROUNDING_REMAINDER);
  }

  return result;
};

const methodology = {
  Fees:
    "The full native-USDC entry price accepted for every BoneYard NFT mint, read from Boneyard's Minted.price event. Excludes BONE genesis reserve, BONE emitted by burns, secondary royalties, and hook swap levies.",
  UserFees: "Same as Fees: every included amount is paid by a miner in a successful Boneyard mint.",
  Revenue:
    "Mint fees less Charge paid to existing Skeletons. Before LP activation, the retained revenue is the project share plus protocol-owned liquidity bootstrap; after LP activation it is the project share plus BONE-buyback funding.",
  SupplySideRevenue:
    "Charge accrued to active Skeleton holders from mint #9 onward (65% under the deployed constant). Charge is measured when it accrues, not when a holder later claims or burns.",
  ProtocolRevenue:
    "The project slice emitted by Hook.ProjectShareAdded plus the pre-LP bootstrap retained by Boneyard to seed its canonical protocol-owned liquidity. If seedLiquidity diverts bootstrap that cannot be paired with BONE into the Hook buyback reserve, that previously booked protocol revenue is reclassified out on BootstrapDivertedToBuyback. Hook-bound revenue is 100% of each of the first eight genesis mints and 35% of later mints.",
  HoldersRevenue:
    "Native USDC allocated by Hook.BuybackAccrualAdded from post-LP mints for market-buying and burning BONE, plus any pre-LP bootstrap reclassified to that reserve by BootstrapDivertedToBuyback at liquidity seeding. It is counted when funded, not when the owner executes the capped buyback. BONE is the protocol's own value-accrual token.",
};

const breakdownMethodology = {
  Fees: {
    [MINT_FEES]: "The exact price field from each successful Boneyard Minted event.",
  },
  Revenue: {
    [PROJECT_SHARE]: "Project share emitted by the Hook for a successful mint.",
    [PROTOCOL_OWNED_LIQUIDITY_BOOTSTRAP]: "Pre-LP mint share retained by Boneyard and later committed to its canonical protocol-owned liquidity position.",
    [BONE_BUYBACK]: "Post-LP mint share credited to the BONE buyback-and-burn reserve.",
    [MINT_ROUNDING_REMAINDER]: "Native wei left in Boneyard by Solidity's independent integer floors for Charge and the hook share; it is not a project payout or BONE buyback allocation.",
  },
  SupplySideRevenue: {
    [CHARGE_TO_SKELETONS]: "Charge accrued to Skeletons alive before each post-genesis mint; holder claims and burn-time Charge payouts are settlement of this already-counted accrual.",
  },
  ProtocolRevenue: {
    [PROJECT_SHARE]: "The project portion of hook-bound mint revenue, taken from Hook.ProjectShareAdded.",
    [PROTOCOL_OWNED_LIQUIDITY_BOOTSTRAP]: "Pre-LP mint share retained by Boneyard and later committed to its canonical protocol-owned liquidity position.",
    [BOOTSTRAP_BUYBACK_RECLASSIFICATION]: "Negative protocol-revenue reclassification when seedLiquidity diverts an already-booked bootstrap remainder into the Hook's BONE buyback reserve.",
    [MINT_ROUNDING_REMAINDER]: "Native wei retained by Boneyard from Solidity's independent integer floors for Charge and the hook share.",
  },
  HoldersRevenue: {
    [BONE_BUYBACK]: "Post-LP mint funding for BONE market buybacks and burns, read from Hook.BuybackAccrualAdded and excluding seed-time bootstrap diversion.",
    [BOOTSTRAP_BUYBACK_RECLASSIFICATION]: "Bootstrap previously classified as protocol-owned liquidity that seedLiquidity explicitly diverts to the BONE buyback-and-burn reserve.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARC],
  start: "2026-09-26", // Boneyard production deployment, block 22,821,183
  // A later seedLiquidity call can reclassify already-booked protocol-owned
  // bootstrap to BONE holder revenue, producing negative protocol revenue in
  // that window while total revenue remains unchanged.
  allowNegativeValue: true,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
