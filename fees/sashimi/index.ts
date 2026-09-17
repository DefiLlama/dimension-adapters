import { AbiCoder } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Sashimi (sashimi.fun) - USDC-native bonding-curve launchpad on Arc. See dexs/sashimi
// for the volume side and trade-event verification notes. Contracts are unverified, so
// events are matched by raw topic0 hash and decoded manually, not via eventAbi.
const CURVE_ENGINE = "0x5b7bf9bd9c35a845ec1d469ed58616e7076a6f5c";
const FACTORY = "0x0d85ac76baaed7a46cb5133b57bce7d8f9a44d58";
const USDC = ADDRESSES.arc.USDC;

const CURVE_TRADE_TOPIC = "0xa1f66e4bd561f4970224fa6654fa58993ac36dfd2b13479a293eba20756cff8c";
const TOKEN_CREATED_TOPIC = "0x979cee093a93828d2e8b673315ae1acdbd57ec336874aeba054d347b48b9e5d1";
const abiCoder = AbiCoder.defaultAbiCoder();
const TRADE_DATA_TYPES = ["bool", "uint256", "uint256", "uint256", "uint256", "uint256"];

function decodeTrade(log: any) {
  const [, , fee] = abiCoder.decode(TRADE_DATA_TYPES, log.data);
  return { fee };
}

// A launch costs exactly 1 USDC, paid directly to CurveEngine (verified on-chain: the
// creator's USDC Transfer log for a real launch tx carried exactly 1_000_000 raw units).
// Docs give no owner-adjustable knob for this (unlike SolonPad's launch fee), and no
// on-chain getter exists for it either (probed common selectors, all revert), so unlike
// SolonPad this is a fixed constant rather than read live.
const LAUNCH_FEE_USDC = 1_000_000;

// Curve trading: 1% of quoteAmount total, split 60% protocol / 40% creator per docs.
// Cross-checked against sashimi.fun/api/stats' all-time estimates: protocolFeesEst /
// creatorFeesEst = 140.90 / 93.93 = 1.500..., an exact match for 0.6/0.4.
//
// Not modeled: the anti-snipe surcharge (up to 50% extra fee, decaying to 0 over the
// first 90 seconds after a launch, 100% of the surcharge to the creator) is folded
// into this fixed 60/40 split rather than separately identified, since the event does
// not break the fee into a base and a surcharge component and reconstructing the decay
// timer per-trade would be a formula, not an on-chain read. This slightly overstates
// protocol revenue and understates creator revenue for trades in that 90-second window.
const LAUNCH_FEES = "Launch Fees";
const CURVE_TRADING_FEES = "Curve Trading Fees";
const LAUNCH_FEES_TO_PROTOCOL = "Launch Fees to Protocol";
const CURVE_FEES_TO_PROTOCOL = "Curve Trading Fees to Protocol";
const CURVE_FEES_TO_CREATORS = "Curve Trading Fees to Creators";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const trades = await options.getLogs({
    target: CURVE_ENGINE,
    topic: CURVE_TRADE_TOPIC,
    entireLog: true,
  });
  for (const log of trades) {
    const { fee } = decodeTrade(log);
    dailyFees.add(USDC, fee, CURVE_TRADING_FEES);
    const protocolShare = (fee * 6n) / 10n;
    dailyRevenue.add(USDC, protocolShare, CURVE_FEES_TO_PROTOCOL);
    dailySupplySideRevenue.add(USDC, fee - protocolShare, CURVE_FEES_TO_CREATORS);
  }

  const launches = await options.getLogs({
    target: FACTORY,
    topic: TOKEN_CREATED_TOPIC,
    entireLog: true,
  });
  if (launches.length) {
    const total = BigInt(LAUNCH_FEE_USDC) * BigInt(launches.length);
    dailyFees.add(USDC, total, LAUNCH_FEES);
    dailyRevenue.add(USDC, total, LAUNCH_FEES_TO_PROTOCOL);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1% total fee on every Sashimi bonding-curve trade, read directly from each trade's own fee amount, plus the flat 1 USDC launch fee. Excludes post-graduation Uniswap v3 fees, which are not yet tracked here.",
  Revenue: "60% of the curve trading fee, per the documented protocol/creator split, plus all launch fees.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "40% of the curve trading fee, paid to the token's creator.",
};

const breakdownMethodology = {
  Fees: {
    [CURVE_TRADING_FEES]: "1% of the gross USDC traded on the bonding curve, read from the fee field of each trade event.",
    [LAUNCH_FEES]: "Flat 1 USDC fee paid by the creator when a token is launched.",
  },
  Revenue: {
    [CURVE_FEES_TO_PROTOCOL]: "60% of the curve trading fee.",
    [LAUNCH_FEES_TO_PROTOCOL]: "All launch fees.",
  },
  ProtocolRevenue: {
    [CURVE_FEES_TO_PROTOCOL]: "60% of the curve trading fee.",
    [LAUNCH_FEES_TO_PROTOCOL]: "All launch fees.",
  },
  SupplySideRevenue: {
    [CURVE_FEES_TO_CREATORS]: "40% of the curve trading fee, paid to the token's creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
