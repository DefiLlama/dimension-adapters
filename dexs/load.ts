import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FROM_BLOCK = 21_349_552;
const START = "2026-09-17";
// Load curve/router amounts are native Arc USDC (18 decimals = msg.value / creationFee()).
// ADDRESSES.arc.USDC (0x3600...0000) is the 6-decimal ERC-20 facade over the same asset —
// booking 1e18 on that token prices each 1 USDC as $1 trillion.
const CREATE_FEE = 10n ** 18n; // factory.creationFee() = 1 native USDC
const ERC20_TO_NATIVE = 10n ** 12n; // 18-decimal native − 6-decimal ERC-20

function toNativeUsdc(amount: bigint) {
  // Instant V3 BondingSwapFeePaid sometimes emits the 6-decimal ERC-20 quantum.
  if (amount > 0n && amount < ERC20_TO_NATIVE) return amount * ERC20_TO_NATIVE;
  return amount;
}

function addNativeUsdc(
  bal: ReturnType<FetchOptions["createBalances"]>,
  amount: bigint | string,
  label?: string,
) {
  const amt = toNativeUsdc(BigInt(amount));
  if (label) bal.addGasToken(amt, label);
  else bal.addGasToken(amt);
}

const CURVE_FACTORY = "0x2b440C9B4EF76e37b19854BA24C21E86654810AD";
const BONDING_V4_FACTORY = "0x3e3221644608a3133B7100BaD643328D219510AD";
const INSTANT_V3_FACTORY = "0x5b764c1d510E10E42f928196c8b2A2b67f3010AD";
const INSTANT_V4_FACTORY = "0xA4F056De2E328BCd9b52a77A08683061128c10AD";
const BONDING_FACTORIES = [CURVE_FACTORY, BONDING_V4_FACTORY];
const FACTORIES = [...BONDING_FACTORIES, INSTANT_V3_FACTORY, INSTANT_V4_FACTORY];

const BONDING_V3_ROUTER = "0x5f641BB05123D6D04E6cf4Fe14Fc887295f810AD";
const BONDING_V4_ROUTER = "0x72E24Bf9A7B799987aCCE828814E20a76e2110AD";
const V3_SWAP_ROUTER = "0xD6161627845D26b4e5972B31097aeC53ede810AD";
const V4_SWAP_ROUTER = "0xA9CA02FC0268d7C288FEce73F73F623ed9Fb10AD";
const ROUTERS = [BONDING_V3_ROUTER, BONDING_V4_ROUTER, V3_SWAP_ROUTER, V4_SWAP_ROUTER];

const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, bytes32 metadataHash, string metadataUri, address pool, uint8 graduationCap, uint16 postGradCreatorShareBps)";
const TRADE =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint256 virtualUsdcReserves, uint256 virtualTokenReserves, uint256 realUsdcReserves)";
const PLATFORM_SWAP_FEE =
  "event BondingSwapFeePaid(address indexed trader, uint256 feeTotal, uint256 toPlatform, uint256 toReferrer)";
const GRADUATED_SWAP =
  "event GraduatedSwap(address indexed token, address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 platformFee)";

const ZERO = "0x0000000000000000000000000000000000000000";

function nonzero(addr?: string) {
  return Boolean(addr && addr.toLowerCase() !== ZERO);
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addPlatformFee = (log: { feeTotal: any; toPlatform: any; toReferrer: any }) => {
    addNativeUsdc(dailyFees, log.feeTotal, "Router Fees");
    addNativeUsdc(dailyRevenue, log.toPlatform, "Router Fees To Protocol");
    addNativeUsdc(dailyProtocolRevenue, log.toPlatform, "Router Fees To Protocol");
    if (log.toReferrer && BigInt(log.toReferrer) !== 0n) {
      addNativeUsdc(dailySupplySideRevenue, log.toReferrer, "Referral Fees");
    }
  };

  const historicalCreates = await options.getLogs({
    targets: BONDING_FACTORIES,
    eventAbi: TOKEN_CREATED,
    fromBlock: FROM_BLOCK,
    cacheInCloud: true,
  });
  const dailyCreates = await options.getLogs({
    targets: FACTORIES,
    eventAbi: TOKEN_CREATED,
  });
  const [v3BondingFees, v4BondingFees, v3DexFees, v4DexFees] = await options.getLogs({
    targets: ROUTERS,
    eventAbi: PLATFORM_SWAP_FEE,
    flatten: false,
  });
  const graduatedSwaps = await options.getLogs({
    target: V4_SWAP_ROUTER,
    eventAbi: GRADUATED_SWAP,
  });

  for (const _log of dailyCreates) {
    addNativeUsdc(dailyFees, CREATE_FEE, "Launch Fees");
    addNativeUsdc(dailyRevenue, CREATE_FEE, "Launch Fees");
    addNativeUsdc(dailyProtocolRevenue, CREATE_FEE, "Launch Fees");
  }

  const curves = historicalCreates.map((log: any) => log.curve).filter(nonzero);

  if (curves.length) {
    const trades = await options.getLogs({
      targets: curves,
      eventAbi: TRADE,
    });
    for (const log of trades) {
      addNativeUsdc(dailyVolume, log.usdcAmount);
      addNativeUsdc(dailyFees, log.fee, "Bonding Curve Fees");
      const protocol = (BigInt(log.fee) * 20n) / 100n;
      const creator = BigInt(log.fee) - protocol;
      addNativeUsdc(dailyRevenue, protocol, "Bonding Curve Fees To Protocol");
      addNativeUsdc(dailyProtocolRevenue, protocol, "Bonding Curve Fees To Protocol");
      addNativeUsdc(dailySupplySideRevenue, creator, "Creator Fees");
    }
  }

  for (const log of [...v3BondingFees, ...v4BondingFees]) {
    addPlatformFee(log);
  }

  // Instant + graduated V3 via Load router: 0.25% fee ⇒ notional = fee * 400
  for (const log of v3DexFees) {
    addNativeUsdc(dailyVolume, BigInt(log.feeTotal) * 400n);
    addPlatformFee(log);
  }

  // Instant + graduated V4: volume from GraduatedSwap; fee split from BondingSwapFeePaid
  for (const log of graduatedSwaps) {
    addNativeUsdc(dailyVolume, log.usdcAmount);
  }
  for (const log of v4DexFees) {
    addPlatformFee(log);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Bonding-curve USDC notional from Trade events, Instant/graduated V3 Load-router notional (0.25% fee × 400), and GraduatedSwap USDC on the V4 Load router. Uniswap pool volume that never hits a Load router is excluded.",
  Fees: "1 USDC create fee, 1% bonding-curve trade fee, and 0.25% Load router fee on Instant/graduated swaps.",
  Revenue:
    "Protocol share: all create fees plus 20% of the 1% curve fee (0.20% of curve volume) plus Load router platform fees.",
  ProtocolRevenue: "All create fees plus 20% of the 1% curve fee (0.20% of curve volume) plus Load router platform fees.",
  SupplySideRevenue:
    "80% of the 1% curve fee to creators, plus trader-referral share of the 0.25% router fee.",
};

const breakdownMethodology = {
  Fees: {
    "Launch Fees": "1 native USDC paid on each TokenCreated.",
    "Bonding Curve Fees": "1% fee on bonding-curve Trade.usdcAmount.",
    "Router Fees": "0.25% Load router fee (BondingSwapFeePaid.feeTotal).",
  },
  Revenue: {
    "Launch Fees": "Create fee kept by the protocol.",
    "Bonding Curve Fees To Protocol": "20% of the 1% curve fee.",
    "Router Fees To Protocol": "BondingSwapFeePaid.toPlatform.",
  },
  ProtocolRevenue: {
    "Launch Fees": "Create fee kept by the protocol.",
    "Bonding Curve Fees To Protocol": "20% of the 1% curve fee.",
    "Router Fees To Protocol": "BondingSwapFeePaid.toPlatform.",
  },
  SupplySideRevenue: {
    "Creator Fees": "80% of the 1% curve fee paid to token creators.",
    "Referral Fees": "Trader-referral share of the 0.25% router fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
