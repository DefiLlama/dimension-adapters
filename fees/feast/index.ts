import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPositionedLogArgs } from "../../helpers/logs";
import { METRIC } from "../../helpers/metrics";

// Feast (https://feast.meme): every coin trades in a PancakeSwap Infinity pool attached to the Feast
// hook, which takes 1% of each swap on the quote leg (a Binance tokenized stock or WBNB) and splits it
// once, at accrual, into fixed per-pool shares (FeastHook._bank). The split is mirrored here per fee.
// Factory: https://bscscan.com/address/0x1003b54659F5e31A7391fEBE824A137e8CDa90da
// Platform sink: https://bscscan.com/address/0x59BA4f39Ce8a405d1C08979680f051c17dC8BBFB
const FACTORY = "0x1003b54659F5e31A7391fEBE824A137e8CDa90da";
// first CoinCreated (2026-10-11): nothing is launched before it
const FIRST_COIN_BLOCK = 127031147;
// FEAST, the platform coin, is launched by the factory's Genesis event (block 127750229,
// tx 0x2c6b5892c5f03e72f016689491f9166f60c43521f1e4f3ee02902aad837abc31) into this FEAST/WBNB pool
const FEAST_POOL_ID = "0x58fbbd6ee5e1588979fac56f68cb10dbcfad04764facd33bb1080f4d2f80f8c0";
const FEAST_HOOK = "0xABFB955e4582f49dc741DCf5354fbB0edaD0A7c5";

const COIN_CREATED_EVENT = "event CoinCreated(address indexed coin, address indexed creator, address indexed quote, bytes32 poolId, uint256 supply, uint16 selfBurnBps, uint16 referrerBps, bytes32 metadataHash)";
const FEE_ACCRUED_EVENT = "event FeeAccrued(bytes32 indexed poolId, uint256 amount)";
const REFERRAL_CREDITED_EVENT = "event ReferralCredited(bytes32 indexed poolId, address indexed referrer, uint256 amount)";
const LP_FEES_COLLECTED_EVENT = "event LpFeesCollected(bytes32 indexed poolId, uint256 quoteCollected)";

// FeastConstants: shares are basis points of the fee itself. The platform share is a constant; the
// self-burn (0-50%) and referrer (0-30%) shares are set per pool in CoinCreated and have no setter.
const BPS = 10_000n;
const PLATFORM_BPS = 2_000n; // 20% of every fee goes to the platform sink
// A coin whose creator is the burn address has no creator payout: its creator share buys and burns the coin
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";

const LABELS = {
  PLATFORM: "Swap Fees To Platform",
  FEAST_POOL_BURN: "FEAST Pool Swap Fees To Burn",
  CREATORS: "Swap Fees To Creators",
  REFERRERS: "Swap Fees To Referrers",
  COIN_BURN: "Swap Fees To Coin Buy Back And Burn",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [coinLogs, feeLogs, referralLogs, lpFeeLogs] = await Promise.all([
    options.getLogs({ target: FACTORY, eventAbi: COIN_CREATED_EVENT, fromBlock: FIRST_COIN_BLOCK, cacheInCloud: true }),
    getPositionedLogArgs(options, { target: FEAST_HOOK, eventAbi: FEE_ACCRUED_EVENT }),
    getPositionedLogArgs(options, { target: FEAST_HOOK, eventAbi: REFERRAL_CREDITED_EVENT }),
    getPositionedLogArgs(options, { target: FEAST_HOOK, eventAbi: LP_FEES_COLLECTED_EVENT }),
  ]);

  const pools: Record<string, { quote: string; creator: string; selfBurnBps: bigint }> = {};
  for (const log of coinLogs) {
    pools[log.poolId.toLowerCase()] = { quote: log.quote, creator: log.creator.toLowerCase(), selfBurnBps: BigInt(log.selfBurnBps) };
  }

  // Log indexes are block-wide, and the events of one fee are emitted back to back: FeeAccrued, then
  // ReferralCredited if the trade was referred (or, for LP fees, LpFeesCollected)
  const position = (log: any, offset = 0) => `${log.blockNumber}:${log.logIndex + offset}`;
  const referrals = new Map(referralLogs.map((log) => [position(log), log]));
  const lpFees = new Map(lpFeeLogs.map((log) => [position(log), log]));

  for (const fee of feeLogs) {
    const poolId = fee.poolId.toLowerCase();
    const pool = pools[poolId];
    if (!pool) throw new Error(`Feast: FeeAccrued for unknown pool ${poolId}`);
    const amount = BigInt(fee.amount);

    // collectLpFees banks the PancakeSwap Infinity LP fee earned by the hook's own position; that pool fee
    // is already counted by the pancakeswap-infinity adapter, so only the 1% Feast fee is counted here
    const lpFee = lpFees.get(position(fee, 1));
    if (lpFee && lpFee.poolId.toLowerCase() === poolId) continue;

    const referral = referrals.get(position(fee, 1));
    const commission = referral && referral.poolId.toLowerCase() === poolId ? BigInt(referral.amount) : 0n;

    const selfBurn = (amount * pool.selfBurnBps) / BPS;
    const platform = (amount * PLATFORM_BPS) / BPS;
    const creatorShare = amount - selfBurn - platform - commission;

    dailyFees.add(pool.quote, amount, METRIC.SWAP_FEES);

    // the platform sink sells what it receives for FEAST at a descending price and burns the FEAST.
    // releasePlatformFees can only pay the sink genesis named, so the share accrued before genesis
    // (2026-10-15) is committed to the same burn and is booked when the fee accrues, like the rest
    dailyRevenue.add(pool.quote, platform, LABELS.PLATFORM);
    dailyHoldersRevenue.add(pool.quote, platform, METRIC.TOKEN_BUY_BACK);

    if (commission > 0n) dailySupplySideRevenue.add(pool.quote, commission, LABELS.REFERRERS);

    if (poolId === FEAST_POOL_ID) {
      // FEAST is launched with the burn address as creator, so its self-burn and creator shares both buy and burn FEAST
      dailyRevenue.add(pool.quote, selfBurn + creatorShare, LABELS.FEAST_POOL_BURN);
      dailyHoldersRevenue.add(pool.quote, selfBurn + creatorShare, METRIC.TOKEN_BUY_BACK);
    } else if (pool.creator === BURN_ADDRESS) {
      dailySupplySideRevenue.add(pool.quote, selfBurn + creatorShare, LABELS.COIN_BURN);
    } else {
      if (selfBurn > 0n) dailySupplySideRevenue.add(pool.quote, selfBurn, LABELS.COIN_BURN);
      dailySupplySideRevenue.add(pool.quote, creatorShare, LABELS.CREATORS);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    // no share of the fee goes to a team treasury: the platform share only buys and burns FEAST
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The 1% fee the Feast hook takes on every buy and sell of a Feast coin, paid in the coin's quote asset (a Binance tokenized stock or BNB). Excludes the PancakeSwap Infinity LP fee and the one-off 1% fee on the FEAST token sale.",
  UserFees: "The 1% fee traders pay on every buy and sell of a Feast coin.",
  Revenue: "The 20% platform share of every fee, plus the self-burn and creator shares of fees in the FEAST/BNB pool, all of which are used to buy and burn the FEAST platform token.",
  ProtocolRevenue: "No part of the fee goes to a team treasury: the platform share is used only to buy and burn FEAST.",
  HoldersRevenue: "The 20% platform share of every fee, sold by the platform sink for FEAST which is burned, plus the self-burn and creator shares of fees in the FEAST/BNB pool, which buy and burn FEAST.",
  SupplySideRevenue: "The rest of each fee, split as the coin's creator fixed it at launch: the creator's share, the referrer's share on referred trades, and the share used to buy back and burn the launched coin itself.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% of every buy and sell in a Feast pool, taken by the Feast hook on the quote leg (FeeAccrued).",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "1% of every buy and sell in a Feast pool, paid by the trader.",
  },
  Revenue: {
    [LABELS.PLATFORM]: "20% of every fee, sent to the platform sink, which sells it for FEAST and burns the FEAST.",
    [LABELS.FEAST_POOL_BURN]: "In the FEAST/BNB pool, whose creator is the burn address, the self-burn and creator shares, which buy and burn FEAST.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Fees used to buy and burn FEAST: the 20% platform share of every fee, and the self-burn and creator shares of the FEAST/BNB pool.",
  },
  SupplySideRevenue: {
    [LABELS.CREATORS]: "The creator's share of each fee: 80% less the coin's self-burn share and, on referred trades, the referrer's share (60%, or 50% on referred trades, at the default shares).",
    [LABELS.REFERRERS]: "The referrer's share (10% by default, at most 30%) of fees on trades that name a referrer, claimable by the referrer.",
    [LABELS.COIN_BURN]: "The self-burn share (20% by default, at most 50%) of each fee, used to buy back and burn the launched coin in its own pool; for coins launched with the burn address as creator, the creator share too.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  // first CoinCreated: block 127031147, 2026-10-11 13:54 UTC
  start: "2026-10-11",
  methodology,
  breakdownMethodology,
};

export default adapter;
