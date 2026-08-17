import { PromisePool } from "@supercharge/promise-pool";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Frontier (frontier.fun) is a bonding-curve token launchpad on Robinhood Chain (4663).
//
// v1 (live 2026-07-30) and v1.2 (live 2026-08-15) are both counted. Every launched
// token trades against one shared BondingCurve that emits Buy/Sell for all markets.
// When a curve fills, the token pays out graduation fees and seeds a Uniswap V4
// pool (LPSeeded); post-graduation swaps are already counted by the uniswap-v4
// adapter on this chain and are not double counted here. Direct-seed launches
// (v1.2) skip the curve and are born on their V4 pool: they emit no curve events
// and their swaps are likewise the uniswap-v4 adapter's.
const WETH = ADDRESSES.robinhood.WETH;

const BUY_EVENT =
  "event Buy(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const SELL_EVENT =
  "event Sell(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const LP_SEEDED_EVENT = "event LPSeeded(address indexed token, address indexed pool)";

// v1 — both deployed in block 23472343.
const V1_BONDING_CURVE = "0xCCa442899dFD80bf04340fa8C245C7EB02F71DD4";
const V1_FACTORY = "0x3cbC9395046607C083B383DC3588A3e8308dFf54";
const V1_LIQUIDITY_MANAGER = "0x97f3578083396D4ef2042868c6aE9d4eC91007A6";
const V1_REFERRAL_MANAGER = "0x6Fb1160A663834e8E53E411CC7202A01F1b144DD";
const V1_DEPLOY_BLOCK = 23472343;
const V1_INITIAL_TX_FEE_BPS = 150n;
const BPS = 10_000n;
const V1_CURVE_FEE_CREATOR_BPS = 7_500n;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const asTopic = (address: string) => "0x" + address.slice(2).toLowerCase().padStart(64, "0");
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TX_FEE_UPDATED_EVENT = "event TxFeeUpdated(uint256 fee)";
const REFERRAL_REWARD_EVENT =
  "event ReferralRewardReceived(address indexed referrer, address indexed referredUser, address indexed token, uint256 reward, bool isDirect)";
const OWNERSHIP_TRANSFERRED_EVENT =
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)";
const V1_COIN_DEPLOYED_EVENT =
  "event CoinDeployed(address indexed creator, address indexed token, address factory, address lp, string name, string symbol, string description, string image, uint256 initialSupply, uint256 maxSupply, uint256 initialETHReserves, uint256 initialPrice, uint256 initialMarketCap, uint256 targetETH)";

// v1.2 production — both deployed in block 36671438.
const V12_BONDING_CURVE = "0xEAaa2aE7De8B80d7a59eCF08B078EfAC6FcE6659";
const CURVE_FEE_DISTRIBUTED_EVENT =
  "event CurveFeeDistributed(address indexed token, uint256 totalFee, uint256 referralAmount, uint256 creatorAmount, uint256 protocolAmount, address feeRecipient)";
const GRADUATION_FEES_PAID_EVENT =
  "event GraduationFeesPaid(address indexed feeRecipient, address indexed caller, uint256 creatorAmount, uint256 protocolAmount, uint256 refundAmount)";

const LABEL = {
  CurveTradeFees: "Curve Trade Fees",
  GraduationFees: "Graduation Fees",
  TradeFeesToProtocol: "Curve Trade Fees to Protocol",
  TradeFeesToCreators: "Curve Trade Fees to Creators",
  TradeFeesToReferrers: "Curve Trade Fees to Referrers",
  GraduationToProtocol: "Graduation Fees to Protocol",
  GraduationToSupplySide: "Graduation Fees to Creators",
  GraduationToCaller: "Graduation Refund to Caller",
};

const logIndexOf = (log: any) => Number(log.logIndex ?? log.index ?? 0);

const asTimeline = (logs: any[], read: (log: any) => any) =>
  logs
    .map((log: any) => ({
      block: Number(log.blockNumber),
      index: logIndexOf(log),
      value: read(log),
    }))
    .sort((a, b) => a.block - b.block || a.index - b.index);

const valueAt = (timeline: ReturnType<typeof asTimeline>, log: any, fallback: any) => {
  const block = Number(log.blockNumber);
  const index = logIndexOf(log);
  let current = fallback;
  for (const entry of timeline) {
    if (entry.block > block || (entry.block === block && entry.index > index)) break;
    current = entry.value;
  }
  return current;
};

type DayBalances = {
  dailyVolume: ReturnType<FetchOptions["createBalances"]>;
  dailyFees: ReturnType<FetchOptions["createBalances"]>;
  dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>;
  dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
};

const addV1 = async (options: FetchOptions, day: DayBalances) => {
  const { dailyVolume, dailyFees, dailyProtocolRevenue, dailySupplySideRevenue } = day;

  const [buyLogs, sellLogs, graduations, feeChanges] = await Promise.all([
    options.getLogs({ target: V1_BONDING_CURVE, eventAbi: BUY_EVENT, onlyArgs: false }),
    options.getLogs({ target: V1_BONDING_CURVE, eventAbi: SELL_EVENT, onlyArgs: false }),
    options.getLogs({ target: V1_BONDING_CURVE, eventAbi: LP_SEEDED_EVENT }),
    options.getLogs({
      target: V1_BONDING_CURVE,
      eventAbi: TX_FEE_UPDATED_EVENT,
      fromBlock: V1_DEPLOY_BLOCK,
      cacheInCloud: true,
      onlyArgs: false,
    }),
  ]);

  const feeTimeline = asTimeline(feeChanges, (log: any) => BigInt(log.args.fee));
  const txFeeBpsAt = (log: any) => valueAt(feeTimeline, log, V1_INITIAL_TX_FEE_BPS);

  const addTrade = (gross: bigint, fee: bigint) => {
    dailyVolume.addGasToken(gross);
    dailyFees.addGasToken(fee, LABEL.CurveTradeFees);
    const creatorCut = (fee * V1_CURVE_FEE_CREATOR_BPS) / BPS;
    dailySupplySideRevenue.addGasToken(creatorCut, LABEL.TradeFeesToCreators);
    dailyProtocolRevenue.addGasToken(fee - creatorCut, LABEL.TradeFeesToProtocol);
  };

  buyLogs.forEach((log: any) => {
    const gross = BigInt(log.args.amount);
    const txFeeBps = txFeeBpsAt(log);
    addTrade(gross, (gross * txFeeBps) / (BPS + txFeeBps));
  });
  sellLogs.forEach((log: any) => {
    const gross = BigInt(log.args.amountOut);
    addTrade(gross, (gross * txFeeBpsAt(log)) / BPS);
  });

  const referralRewards = await options.getLogs({
    target: V1_REFERRAL_MANAGER,
    eventAbi: REFERRAL_REWARD_EVENT,
  });
  referralRewards.forEach((log: any) => {
    const reward = BigInt(log.reward);
    if (reward === 0n) return;
    dailyProtocolRevenue.addGasToken(-reward, LABEL.TradeFeesToProtocol);
    dailySupplySideRevenue.add(WETH, reward, LABEL.TradeFeesToReferrers);
  });

  if (!graduations.length) return;

  const [launches, ownershipChanges] = await Promise.all([
    options.getLogs({
      target: V1_FACTORY,
      eventAbi: V1_COIN_DEPLOYED_EVENT,
      fromBlock: V1_DEPLOY_BLOCK,
      cacheInCloud: true,
    }),
    options.getLogs({
      target: V1_FACTORY,
      eventAbi: OWNERSHIP_TRANSFERRED_EVENT,
      fromBlock: V1_DEPLOY_BLOCK,
      cacheInCloud: true,
      onlyArgs: false,
    }),
  ]);

  const creatorOf: Record<string, string> = {};
  launches.forEach((log: any) => {
    creatorOf[String(log.token).toLowerCase()] = String(log.creator).toLowerCase();
  });
  const ownerTimeline = asTimeline(ownershipChanges, (log: any) =>
    String(log.args.newOwner).toLowerCase()
  );

  const { results: payoutLegs, errors: payoutErrors } = await PromisePool.withConcurrency(5)
    .for(graduations)
    .process(async (log: any) => {
      const transfers = await options.getLogs({
        target: WETH,
        eventAbi: TRANSFER_EVENT,
        topics: [TRANSFER_TOPIC, asTopic(log.token)],
        onlyArgs: false,
      });
      return transfers.map((transfer: any) => ({
        transfer,
        token: String(log.token).toLowerCase(),
      }));
    });

  if (payoutErrors.length) {
    throw new Error(
      `[frontier-fun] ${payoutErrors.length} of ${graduations.length} v1 graduation payout queries failed: ${payoutErrors[0].message}`
    );
  }

  payoutLegs.flat().forEach(({ transfer, token }: any) => {
    const recipient = String(transfer.args.to).toLowerCase();
    if (recipient === V1_LIQUIDITY_MANAGER.toLowerCase()) return;
    const amount = BigInt(transfer.args.value);
    if (amount === 0n) return;

    if (recipient === creatorOf[token]) {
      dailyFees.add(WETH, amount, LABEL.GraduationFees);
      dailySupplySideRevenue.add(WETH, amount, LABEL.GraduationToSupplySide);
    } else if (recipient === valueAt(ownerTimeline, transfer, "")) {
      dailyFees.add(WETH, amount, LABEL.GraduationFees);
      dailyProtocolRevenue.add(WETH, amount, LABEL.GraduationToProtocol);
    } else {
      console.error(
        `[frontier-fun] unclassified v1 graduation payout from ${token} to ${recipient}, not counted`
      );
    }
  });
};

const addV12 = async (options: FetchOptions, day: DayBalances) => {
  const { dailyVolume, dailyFees, dailyProtocolRevenue, dailySupplySideRevenue } = day;

  const [buyLogs, sellLogs, feeSplits, graduations] = await Promise.all([
    options.getLogs({ target: V12_BONDING_CURVE, eventAbi: BUY_EVENT }),
    options.getLogs({ target: V12_BONDING_CURVE, eventAbi: SELL_EVENT }),
    options.getLogs({ target: V12_BONDING_CURVE, eventAbi: CURVE_FEE_DISTRIBUTED_EVENT }),
    options.getLogs({ target: V12_BONDING_CURVE, eventAbi: LP_SEEDED_EVENT }),
  ]);

  buyLogs.forEach((log: any) => dailyVolume.addGasToken(BigInt(log.amount)));
  sellLogs.forEach((log: any) => dailyVolume.addGasToken(BigInt(log.amountOut)));

  feeSplits.forEach((log: any) => {
    dailyFees.add(WETH, BigInt(log.totalFee), LABEL.CurveTradeFees);
    const referral = BigInt(log.referralAmount);
    if (referral !== 0n) dailySupplySideRevenue.add(WETH, referral, LABEL.TradeFeesToReferrers);
    const creator = BigInt(log.creatorAmount);
    if (creator !== 0n) dailySupplySideRevenue.add(WETH, creator, LABEL.TradeFeesToCreators);
    const protocol = BigInt(log.protocolAmount);
    if (protocol !== 0n) dailyProtocolRevenue.add(WETH, protocol, LABEL.TradeFeesToProtocol);
  });

  if (!graduations.length) return;

  const feesPaid = await options.getLogs({
    targets: [...new Set(graduations.map((log: any) => String(log.token)))],
    eventAbi: GRADUATION_FEES_PAID_EVENT,
  });
  feesPaid.forEach((log: any) => {
    const creator = BigInt(log.creatorAmount);
    if (creator !== 0n) {
      dailyFees.add(WETH, creator, LABEL.GraduationFees);
      dailySupplySideRevenue.add(WETH, creator, LABEL.GraduationToSupplySide);
    }
    const protocol = BigInt(log.protocolAmount);
    if (protocol !== 0n) {
      dailyFees.add(WETH, protocol, LABEL.GraduationFees);
      dailyProtocolRevenue.add(WETH, protocol, LABEL.GraduationToProtocol);
    }
    const refund = BigInt(log.refundAmount);
    if (refund !== 0n) {
      dailyFees.add(WETH, refund, LABEL.GraduationFees);
      dailySupplySideRevenue.add(WETH, refund, LABEL.GraduationToCaller);
    }
  });
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const day: DayBalances = {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  };

  await addV1(options, day);
  await addV12(options, day);

  const dailyRevenue = day.dailyProtocolRevenue.clone();

  return {
    dailyVolume: day.dailyVolume,
    dailyFees: day.dailyFees,
    dailyUserFees: day.dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: day.dailyProtocolRevenue,
    dailySupplySideRevenue: day.dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Gross ETH notional (fees included) of buys and sells executed on Frontier bonding curves (v1 and v1.2), taken directly from each shared BondingCurve contract's Buy/Sell events, both of which emit the gross figure. Once a curve fills it graduates to a Uniswap V4 pool on the canonical PoolManager; those swaps, and the swaps of v1.2 direct-seed launches that skip the curve entirely, are counted by the uniswap-v4 adapter on Robinhood Chain and are not double counted here.",
  Fees: "The bonding-curve trade fee charged on every buy and sell (1.5% of the trade's cost at the time of writing), plus the fees a token pays out of the ETH it raised when its curve fills and seeds its Uniswap V4 pool. v1 reconstructs the trade fee from the on-chain txFee timeline and graduation payouts from WETH transfers; v1.2 reads both exactly from CurveFeeDistributed and GraduationFeesPaid.",
  UserFees: "Same as Fees: every fee is paid by traders out of their trade or out of the ETH they raised.",
  Revenue:
    "Protocol revenue across both deployments: on v1, the protocol's 25% of the bonding-curve trade fee net of referrer rewards plus the factory owner's graduation share; on v1.2, the residual share of the trade fee after referrer and creator cuts (creator share owner-tunable via creatorShareBps) plus the protocol's graduation share, pushed to a dedicated treasury as WETH. Frontier has no protocol token, so there is no holders revenue and Revenue equals ProtocolRevenue.",
  ProtocolRevenue:
    "v1: 25% of the curve trade fee net of referrer rewards, plus WETH sent to the factory owner at graduation. v1.2: residual share of the curve trade fee (50% at the time of writing, net of referrer rewards) plus its share of graduation payouts (0% at the time of writing).",
  SupplySideRevenue:
    "v1: the creator's 75% of every curve trade fee, referrer rewards, and the 5% graduation fee to the token creator. v1.2: the creator's share of every curve trade fee (50% at the time of writing), referrer rewards, the 5% graduation fee to the creator, and the graduation refund to the caller (0% at the time of writing).",
};

const feesBreakdown = {
  [LABEL.CurveTradeFees]:
    "Trade fee withheld by the bonding curve on every buy and sell, at the on-chain txFee rate (150 bps at the time of writing). v1 reconstructs it from Buy/Sell and TxFeeUpdated; v1.2 emits it per trade as CurveFeeDistributed.",
  [LABEL.GraduationFees]:
    "Fees paid in WETH out of the ETH a token raised when its curve fills. v1 classifies WETH transfers to the creator (5%) and factory owner (0% at the time of writing); v1.2 uses GraduationFeesPaid (creator 5%, protocol 0%, caller refund 0% at the time of writing). The ETH that seeds the Uniswap V4 pool is liquidity, not a fee, and is excluded.",
};

const protocolRevenueBreakdown = {
  [LABEL.TradeFeesToProtocol]:
    "The protocol's share of the bonding-curve trade fee, net of the referrer's share on referred trades (25% on v1; residual after creator/referrer on v1.2, 50% at the time of writing).",
  [LABEL.GraduationToProtocol]: "The protocol's share of the graduation payout.",
};

const breakdownMethodology = {
  Fees: feesBreakdown,
  UserFees: feesBreakdown,
  Revenue: protocolRevenueBreakdown,
  ProtocolRevenue: protocolRevenueBreakdown,
  SupplySideRevenue: {
    [LABEL.TradeFeesToCreators]:
      "The token creator's share of every bonding-curve trade fee (75% on v1; owner-tunable, 50% at the time of writing on v1.2).",
    [LABEL.TradeFeesToReferrers]:
      "The referrer's share of the curve trade fee on a referred trade, paid in WETH.",
    [LABEL.GraduationToSupplySide]:
      "The graduation fee paid to the token creator, 5% of the ETH its curve raised.",
    [LABEL.GraduationToCaller]:
      "The v1.2 graduation refund paid to the caller who triggered graduation (0% at the time of writing).",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-30", // first CoinDeployed event (v1), block 23650298
  methodology,
  breakdownMethodology,
};

export default adapter;
