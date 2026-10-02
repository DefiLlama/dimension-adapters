import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Arc stack: https://github.com/Strikt-Crypto/Load/blob/main/packages/contracts/deployments/5042.json
// Native gas USDC is 18 decimals; ADDRESSES.arc.USDC (0x3600…0000) is the 6-decimal ERC-20 facade.
// LoadArcQuote.NATIVE_TO_ERC20 = 1e12.
const USDC = ADDRESSES.arc.USDC;
const NATIVE_TO_ERC20 = 10n ** 12n;
// V3 router sells emit BondingSwapFeePaid in 6-dec ERC-20 units; buys / bonding / V4 emit 18-dec native.
const NATIVE_UNIT_FLOOR = 10n ** 9n;
// Current factory-stack deploy. A targets query uses one fromBlock — the min
// across every contract in the set — so later contracts are included from here.
const FROM_BLOCK = 21_349_552;
const CREATE_FEE_USDC6 = 10n ** 6n; // 1 USDC after 18→6 conversion (creationFee / launchFeeWei = 1 ether)
const CURVE_PROTOCOL_SHARE = 20n; // LoadCurveFactory.PROTOCOL_FEE_BPS (of 1% TRADE_FEE_BPS)
const CURVE_SHARE_DENOM = 100n;
const START = "2026-09-17";

const CURVE_FACTORY = "0x2b440C9B4EF76e37b19854BA24C21E86654810AD";
const BONDING_V4_FACTORY = "0x3e3221644608a3133B7100BaD643328D219510AD";
const INSTANT_V3_FACTORY = "0x5b764c1d510E10E42f928196c8b2A2b67f3010AD";
const INSTANT_V4_FACTORY = "0xA4F056De2E328BCd9b52a77A08683061128c10AD";

const BONDING_V3_ROUTER = "0x5f641BB05123D6D04E6cf4Fe14Fc887295f810AD";
const BONDING_V4_ROUTER = "0x72E24Bf9A7B799987aCCE828814E20a76e2110AD";
const V3_SWAP_ROUTER = "0xD6161627845D26b4e5972B31097aeC53ede810AD";
const V4_SWAP_ROUTER = "0xA9CA02FC0268d7C288FEce73F73F623ed9Fb10AD";

const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, bytes32 metadataHash, string metadataUri, address pool, uint8 graduationCap, uint16 postGradCreatorShareBps)";
const TRADE =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 virtualUsdcReserves, uint256 virtualTokenReserves, uint256 realUsdcReserves)";
const PLATFORM_SWAP_FEE =
  "event BondingSwapFeePaid(address indexed trader, uint256 feeTotal, uint256 toPlatform, uint256 toReferrer)";

const ZERO = ADDRESSES.null;

function nonzero(addr?: string) {
  return Boolean(addr && addr.toLowerCase() !== ZERO);
}

/** Book against ADDRESSES.arc.USDC (6 decimals). */
function toUsdc6(raw: any): bigint {
  const amount = BigInt(raw || 0);
  if (amount >= NATIVE_UNIT_FLOOR) return amount / NATIVE_TO_ERC20;
  return amount;
}

function addPlatformFee(
  log: { feeTotal: any; toPlatform: any; toReferrer: any },
  d: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
    dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>;
    dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) {
  const feeTotal = toUsdc6(log.feeTotal);
  const toPlatform = toUsdc6(log.toPlatform);
  const toReferrer = toUsdc6(log.toReferrer);
  d.dailyFees.add(USDC, feeTotal, "Router Fees");
  d.dailyRevenue.add(USDC, toPlatform, "Router Fees To Protocol");
  d.dailyProtocolRevenue.add(USDC, toPlatform, "Router Fees To Protocol");
  if (toReferrer !== 0n) {
    d.dailySupplySideRevenue.add(USDC, toReferrer, "Referral Fees");
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const d = {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };

  const curveFactories = [CURVE_FACTORY, BONDING_V4_FACTORY];
  const factories = [...curveFactories, INSTANT_V3_FACTORY, INSTANT_V4_FACTORY];
  const routers = [
    BONDING_V3_ROUTER,
    BONDING_V4_ROUTER,
    V3_SWAP_ROUTER,
    V4_SWAP_ROUTER,
  ];

  const [historicalCreates, dailyCreates, platformFees] = await Promise.all([
    options.getLogs({
      targets: curveFactories,
      eventAbi: TOKEN_CREATED,
      fromBlock: FROM_BLOCK,
      cacheInCloud: true,
    }),
    options.getLogs({ targets: factories, eventAbi: TOKEN_CREATED }),
    options.getLogs({ targets: routers, eventAbi: PLATFORM_SWAP_FEE }),
  ]);

  // Launch referrer 5% is paid in native USDC with no event, so the full 1 USDC
  // create fee is booked as protocol revenue (Fees = Revenue + SupplySide still holds).
  for (const _log of dailyCreates) {
    dailyFees.add(USDC, CREATE_FEE_USDC6, "Launch Fees");
    dailyRevenue.add(USDC, CREATE_FEE_USDC6, "Launch Fees");
    dailyProtocolRevenue.add(USDC, CREATE_FEE_USDC6, "Launch Fees");
  }

  const curves = historicalCreates
    .map((log: any) => log.curve)
    .filter(nonzero);

  if (curves.length) {
    const trades = await options.getLogs({
      targets: curves,
      eventAbi: TRADE,
    });
    for (const log of trades) {
      const usdcAmount = toUsdc6(log.usdcAmount);
      const fee = toUsdc6(log.fee);
      dailyVolume.add(USDC, usdcAmount);
      dailyFees.add(USDC, fee, "Bonding Curve Fees");
      const protocol = (fee * CURVE_PROTOCOL_SHARE) / CURVE_SHARE_DENOM;
      const creator = fee - protocol;
      dailyRevenue.add(USDC, protocol, "Bonding Curve Fees To Protocol");
      dailyProtocolRevenue.add(USDC, protocol, "Bonding Curve Fees To Protocol");
      dailySupplySideRevenue.add(USDC, creator, "Creator Fees");
    }
  }

  // Router fees stay. Post-graduation notional (V3 fee × 400, V4 GraduatedSwap)
  // belongs to the receiving DEX, so it is not Load volume.
  for (const log of platformFees) {
    addPlatformFee(log, d);
  }

  return d;
};

const methodology = {
  Volume:
    "Bonding-curve USDC notional from Trade events. Native 18-dec amounts are converted to 6-dec Arc USDC. Post-graduation swaps on the Load routers are excluded.",
  Fees: "1 USDC create fee, 1% bonding-curve trade fee, and 0.25% Load router fee on Instant/graduated swaps.",
  Revenue:
    "Protocol share: all create fees plus 20% of the 1% curve fee (0.20% of curve volume) plus Load router platform fees. The 5% launch-referrer cut of the create fee is included here because it is not emitted on-chain.",
  ProtocolRevenue: "All create fees plus 20% of the 1% curve fee (0.20% of curve volume) plus Load router platform fees. The 5% launch-referrer cut of the create fee is included here because it is not emitted on-chain.",
  SupplySideRevenue:
    "80% of the 1% curve fee to creators, plus trader-referral share of the 0.25% router fee.",
};

const breakdownMethodology = {
  Fees: {
    "Launch Fees": "1 native USDC paid on each TokenCreated, booked as 6-decimal Arc USDC.",
    "Bonding Curve Fees": "1% fee on bonding-curve Trade.usdcAmount (native 18-dec → 6-dec USDC).",
    "Router Fees": "0.25% Load router fee (BondingSwapFeePaid.feeTotal).",
  },
  Revenue: {
    "Launch Fees": "Create fee kept by the protocol (includes undetectable 5% launch-referrer payouts).",
    "Bonding Curve Fees To Protocol": "20% of the 1% curve fee (PROTOCOL_FEE_BPS).",
    "Router Fees To Protocol": "BondingSwapFeePaid.toPlatform.",
  },
  ProtocolRevenue: {
    "Launch Fees": "Create fee kept by the protocol (includes undetectable 5% launch-referrer payouts).",
    "Bonding Curve Fees To Protocol": "20% of the 1% curve fee (PROTOCOL_FEE_BPS).",
    "Router Fees To Protocol": "BondingSwapFeePaid.toPlatform.",
  },
  SupplySideRevenue: {
    "Creator Fees": "80% of the 1% curve fee paid to token creators (CREATOR_FEE_BPS).",
    "Referral Fees": "Trader-referral share of the 0.25% router fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
