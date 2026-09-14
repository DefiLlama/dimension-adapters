import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// https://curve.bubbleswap.io/faq
// Public ABI: https://curve.bubbleswap.io/dev
// Production v2 only; deployed at Shido block 41608398 on 2026-08-31.
// All bonding curves emit here, not at the launched token or DEX pool addresses.
const FACTORY = "0xe8EFF935F46600640d2d0F55C2b8E65565007fB1";
const TRADE = "event Trade(address indexed token, address indexed trader, bool indexed isBuy, uint256 nativeAmount, uint256 tokenAmount, uint256 protocolFee, uint256 creatorFee, uint256 postTradeReserve, uint256 postTradePriceX18)";
const GRADUATED = "event Graduated(address indexed token, address indexed pool, uint256 indexed lpTokenId, address beneficiary, uint256 lockUntil, uint256 graduationFee, uint256 nativeLiquidity, uint256 tokenLiquidity, uint256 burnedTokenRemainder)";

// Events are native SHIDO amounts in wei. WSHIDO wraps native SHIDO 1:1,
// with the same 18 decimals, and has a supported DefiLlama price mapping.
const SHIDO = ADDRESSES.shido.WSHIDO;

const feeBreakdown = {
  "Bonding Curve Trading Fees": "Protocol and creator trading fees emitted by the production factory's Trade events, accrued when each trade executes regardless of when claimed.",
  "Graduation Fees": "The graduationFee emitted by Graduated, deducted from the curve's native reserve before DEX liquidity is created.",
};

const userFeeBreakdown = {
  "Bonding Curve Trading Fees": "Protocol and creator trading fees directly paid by bonding-curve traders.",
};

const revenueBreakdown = {
  "Bonding Curve Trading Fees To Protocol": "Only the protocolFee component of Trade events, excluding creator fees.",
  "Graduation Fees To Protocol": "The full graduationFee component of Graduated events, accrued to the protocol.",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Use the caller's window. Do not reset fromBlock to deployment here:
  // that would recount history on every hourly pull.
  const trades = await options.getLogs({ target: FACTORY, eventAbi: TRADE });

  for (const trade of trades) {
    // Buy: grossUsed (refund excluded). Sell: grossShidoOut (before fees).
    // Count only the SHIDO side, once; neither subtract nor add fees again.
    dailyVolume.add(SHIDO, trade.nativeAmount);

    dailyFees.add(
      SHIDO,
      trade.protocolFee + trade.creatorFee,
      "Bonding Curve Trading Fees"
    );
    dailyUserFees.add(
      SHIDO,
      trade.protocolFee + trade.creatorFee,
      "Bonding Curve Trading Fees"
    );

    dailyRevenue.add(
      SHIDO,
      trade.protocolFee,
      "Bonding Curve Trading Fees To Protocol"
    );

    dailySupplySideRevenue.add(
      SHIDO,
      trade.creatorFee,
      "Bonding Curve Trading Fees To Creators"
    );
  }

  const graduations = await options.getLogs({
    target: FACTORY,
    eventAbi: GRADUATED,
  });

  for (const graduation of graduations) {
    // Graduation fee is deducted from the curve reserve rather than
    // charged directly to an end-user, so it is not a UserFee.
    dailyFees.add(SHIDO, graduation.graduationFee, "Graduation Fees");
    dailyRevenue.add(
      SHIDO,
      graduation.graduationFee,
      "Graduation Fees To Protocol"
    );
  }

  // Claims only settle previously accrued fees; never count them again.
  // No legacy factory, router, DEX Swap, LP-fee or liquidity-movement events.
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SHIDO],
  start: "2026-08-31",
  fetch,
  methodology: {
    Volume: "Gross native SHIDO notional from Trade.nativeAmount on the production v2 bonding-curve factory, counting one side of each buy/sell. Buy refunds are excluded. No legacy-factory activity, BubbleSwap/router activity, post-graduation Shido DEX trading, LP activity or graduation liquidity is counted.",
    Fees: "Actual protocol and creator trading fees from Trade, plus the graduationFee from Graduated. Accrual basis in native SHIDO, valued using its 1:1 WSHIDO wrapper. No fixed fee-rate estimates, claim double-counting, gas fees or post-graduation fees.",
    UserFees: "Protocol and creator trading fees directly paid by bonding-curve traders. Graduation fees are excluded because they are deducted from the curve reserve before migration rather than charged directly to an end-user.",
    Revenue: "Protocol trading fees plus graduation fees, excluding the creator trading-fee share and all post-graduation revenue.",
    ProtocolRevenue: "Same as Revenue (protocol trading fees + graduation fees): fees allocated to the protocol when accrued at the factory. Subsequent treasury spending or announced buybacks are not measured by this adapter.",
    SupplySideRevenue: "Creator trading fees accrued by Trade events. This is creator income, not LP fees or revenue of holders of the Bubble Protocol token.",
  },
  breakdownMethodology: {
    Fees: feeBreakdown,
    UserFees: userFeeBreakdown,
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: {
      "Bonding Curve Trading Fees To Creators": "The creatorFee component emitted for every bonding-curve trade, whether already claimed or still claimable.",
    },
  },
};

export default adapter;
