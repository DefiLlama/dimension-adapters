import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Frontier (frontier.fun) is a bonding-curve token launchpad on Robinhood Chain (4663).
//
// Tracks the v1.2 production deployment (live 2026-08-15). Every launched token
// trades against one shared BondingCurve contract that emits Buy/Sell for all
// markets, and every fee split is emitted on-chain (CurveFeeDistributed per
// trade, GraduationFeesPaid at graduation), so nothing is reconstructed from
// rates. All fee payouts are pushed as WETH at source: referrer, creator and
// the protocol treasury are paid inside the trade or graduation.
//
// When a curve fills, the token pays out graduation fees and seeds a Uniswap V4
// pool (LPSeeded); post-graduation swaps are already counted by the uniswap-v4
// adapter on this chain and are not double counted here. Direct-seed launches
// skip the curve and are born on their V4 pool: they emit no curve events and
// their swaps (including the optional dev buy, a real V4 swap) are likewise the
// uniswap-v4 adapter's.
//
// https://robinhoodchain.blockscout.com/address/0xEAaa2aE7De8B80d7a59eCF08B078EfAC6FcE6659
// Factory: 0xe3A826C056e578c240D362BF4C2fa53E5c0c17a5.
const BONDING_CURVE = "0xEAaa2aE7De8B80d7a59eCF08B078EfAC6FcE6659";
const WETH = ADDRESSES.robinhood.WETH;

// Both events emit the GROSS ETH notional (Buy.amount is msg.value,
// fee-inclusive; Sell.amountOut is pre-fee proceeds).
const BUY_EVENT =
  "event Buy(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const SELL_EVENT =
  "event Sell(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const LP_SEEDED_EVENT = "event LPSeeded(address indexed token, address indexed pool)";
// One event per non-zero-fee trade carrying the fee's exact split
// (referralAmount + creatorAmount + protocolAmount == totalFee). It exists
// because the total is not reliably reconstructable off Buy/Sell (the
// supply-capping final buy recomputes the fee fee-exclusive, sells round on
// amountOut + 1) and the creator share is owner-tunable
// (BCTokenFactory.creatorShareBps).
const CURVE_FEE_DISTRIBUTED_EVENT =
  "event CurveFeeDistributed(address indexed token, uint256 totalFee, uint256 referralAmount, uint256 creatorAmount, uint256 protocolAmount, address feeRecipient)";
// Emitted once by the graduating token in _seedLP with the graduation fee
// breakdown.
const GRADUATION_FEES_PAID_EVENT =
  "event GraduationFeesPaid(address indexed feeRecipient, address indexed caller, uint256 creatorAmount, uint256 protocolAmount, uint256 refundAmount)";

const LABEL = {
  // sources
  CurveTradeFees: "Curve Trade Fees",
  GraduationFees: "Graduation Fees",
  // destinations
  TradeFeesToProtocol: "Curve Trade Fees to Protocol",
  TradeFeesToCreators: "Curve Trade Fees to Creators",
  TradeFeesToReferrers: "Curve Trade Fees to Referrers",
  GraduationToProtocol: "Graduation Fees to Protocol",
  GraduationToSupplySide: "Graduation Fees to Creators",
  GraduationToCaller: "Graduation Refund to Caller",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [buyLogs, sellLogs, feeSplits, graduations] = await Promise.all([
    options.getLogs({ target: BONDING_CURVE, eventAbi: BUY_EVENT }),
    options.getLogs({ target: BONDING_CURVE, eventAbi: SELL_EVENT }),
    options.getLogs({ target: BONDING_CURVE, eventAbi: CURVE_FEE_DISTRIBUTED_EVENT }),
    options.getLogs({ target: BONDING_CURVE, eventAbi: LP_SEEDED_EVENT }),
  ]);

  buyLogs.forEach((log: any) => dailyVolume.addGasToken(BigInt(log.amount)));
  sellLogs.forEach((log: any) => dailyVolume.addGasToken(BigInt(log.amountOut)));

  // The referral share comes off the top, the creator share
  // (BCTokenFactory.creatorShareBps, owner-tunable, set to 50% at deployment)
  // applies to the fee net of referral, and the protocol keeps the residual —
  // the event guarantees referral + creator + protocol == totalFee to the wei.
  feeSplits.forEach((log: any) => {
    dailyFees.add(WETH, BigInt(log.totalFee), LABEL.CurveTradeFees);
    const referral = BigInt(log.referralAmount);
    if (referral !== 0n) dailySupplySideRevenue.add(WETH, referral, LABEL.TradeFeesToReferrers);
    const creator = BigInt(log.creatorAmount);
    if (creator !== 0n) dailySupplySideRevenue.add(WETH, creator, LABEL.TradeFeesToCreators);
    const protocol = BigInt(log.protocolAmount);
    if (protocol !== 0n) dailyProtocolRevenue.add(WETH, protocol, LABEL.TradeFeesToProtocol);
  });

  if (graduations.length) {
    // Each graduating token emits its own fee breakdown in the same transaction
    // as the curve's LPSeeded, so the scan is bounded to the day's graduates.
    // Configured rates at deployment: creator 5%, protocol 0%, caller refund 0%
    // of the raised ETH — the event keeps the split exact if they change.
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
      // Paid out of the raised ETH to whoever triggered graduation — a keeper
      // incentive, so it counts as a fee to the supply side, not the protocol.
      const refund = BigInt(log.refundAmount);
      if (refund !== 0n) {
        dailyFees.add(WETH, refund, LABEL.GraduationFees);
        dailySupplySideRevenue.add(WETH, refund, LABEL.GraduationToCaller);
      }
    });
  }

  // Frontier has no protocol token, so there are no holders revenue and
  // Revenue == ProtocolRevenue == Fees - SupplySideRevenue. Cloned so the two
  // returned dimensions do not alias the same Balances instance.
  const dailyRevenue = dailyProtocolRevenue.clone();

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Gross ETH notional (fees included) of buys and sells executed on Frontier bonding curves, taken directly from the shared BondingCurve contract's Buy/Sell events, both of which emit the gross figure. Once a curve fills it graduates to a Uniswap V4 pool on the canonical PoolManager; those swaps, and the swaps of direct-seed launches that skip the curve entirely, are counted by the uniswap-v4 adapter on Robinhood Chain and are not double counted here.",
  Fees: "The bonding-curve trade fee charged on every buy and sell (1.5% of the trade's cost at the time of writing), plus the fees a token pays out of the ETH it raised when its curve fills and seeds its Uniswap V4 pool. Both are read exactly from the on-chain fee events (CurveFeeDistributed, GraduationFeesPaid).",
  UserFees: "Same as Fees: every fee is paid by traders out of their trade or out of the ETH they raised.",
  Revenue:
    "Protocol revenue: the protocol's residual share of the bonding-curve trade fee after the referrer's and creator's cuts (creator share owner-tunable via creatorShareBps, 50% net of referral at the time of writing), plus the protocol's share of graduation payouts, pushed to a dedicated treasury as WETH at source. Frontier has no protocol token, so there is no holders revenue and Revenue equals ProtocolRevenue.",
  ProtocolRevenue:
    "The protocol's residual share of the bonding-curve trade fee (50% at the time of writing, net of referrer rewards), plus its share of graduation payouts (0% at the time of writing), delivered to the protocol treasury.",
  SupplySideRevenue:
    "The creator's share of every bonding-curve trade fee (50% at the time of writing), the referrer's share on referred trades, the graduation fee paid to the token creator (5% of the ETH its curve raised), and the graduation refund paid to the caller who triggered graduation (0% at the time of writing).",
};

const feesBreakdown = {
  [LABEL.CurveTradeFees]:
    "Trade fee withheld by the bonding curve on every buy and sell, at the on-chain txFee rate (150 bps at the time of writing), emitted per trade by CurveFeeDistributed.",
  [LABEL.GraduationFees]:
    "Fees paid in WETH out of the ETH a token raised when its curve fills: to the creator (5%), the protocol (0% at the time of writing) and a refund to the graduation caller (0% at the time of writing). The ETH that seeds the Uniswap V4 pool is liquidity, not a fee, and is excluded.",
};

const protocolRevenueBreakdown = {
  [LABEL.TradeFeesToProtocol]:
    "The protocol's residual share of the bonding-curve trade fee (50% at the time of writing), net of the referrer's share on referred trades.",
  [LABEL.GraduationToProtocol]: "The protocol's share of the graduation payout.",
};

const breakdownMethodology = {
  // dailyUserFees is dailyFees, and dailyRevenue is dailyProtocolRevenue, so those
  // pairs share the same breakdown.
  Fees: feesBreakdown,
  UserFees: feesBreakdown,
  Revenue: protocolRevenueBreakdown,
  ProtocolRevenue: protocolRevenueBreakdown,
  SupplySideRevenue: {
    [LABEL.TradeFeesToCreators]:
      "The token creator's share of every bonding-curve trade fee (owner-tunable, 50% at the time of writing).",
    [LABEL.TradeFeesToReferrers]:
      "The referrer's share of the curve trade fee on a referred trade, paid in WETH.",
    [LABEL.GraduationToSupplySide]:
      "The graduation fee paid to the token creator, 5% of the ETH its curve raised.",
    [LABEL.GraduationToCaller]:
      "The graduation refund paid to the caller who triggered graduation (0% at the time of writing).",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-15", // v1.2 production deployment, block 36671438
  methodology,
  breakdownMethodology,
};

export default adapter;
