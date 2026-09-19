import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const USDC = ADDRESSES.arc.USDC;
const FROM_BLOCK = 21_349_552;
// ADDRESSES.arc.USDC is the 6-decimal ERC-20 facade (0x3600...0000), not Arc's 18-decimal
// native representation of the same balance - 10n**18n here was booking each 1 USDC create
// fee as $1 trillion.
const CREATE_FEE = 10n ** 6n; // 1 USDC (6 decimals)
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
const GRADUATED_SWAP =
  "event GraduatedSwap(address indexed token, address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 platformFee)";

const ZERO = "0x0000000000000000000000000000000000000000";

function nonzero(addr?: string) {
  return Boolean(addr && addr.toLowerCase() !== ZERO);
}

export type LoadDimensions = {
  dailyVolume: ReturnType<FetchOptions["createBalances"]>;
  dailyFees: ReturnType<FetchOptions["createBalances"]>;
  dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>;
  dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
};

function addPlatformFee(
  log: { feeTotal: any; toPlatform: any; toReferrer: any },
  d: Pick<
    LoadDimensions,
    "dailyFees" | "dailyRevenue" | "dailyProtocolRevenue" | "dailySupplySideRevenue"
  >,
) {
  d.dailyFees.add(USDC, log.feeTotal, "Router Fees");
  d.dailyRevenue.add(USDC, log.toPlatform, "Router Fees To Protocol");
  d.dailyProtocolRevenue.add(USDC, log.toPlatform, "Router Fees To Protocol");
  if (log.toReferrer && BigInt(log.toReferrer) !== 0n) {
    d.dailySupplySideRevenue.add(USDC, log.toReferrer, "Referral Fees");
  }
}

export async function collectLoadDimensions(
  options: FetchOptions,
): Promise<LoadDimensions> {
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

  const factories = [
    CURVE_FACTORY,
    BONDING_V4_FACTORY,
    INSTANT_V3_FACTORY,
    INSTANT_V4_FACTORY,
  ];

  const [historicalCreates, dailyCreates, platformFees, graduatedSwaps] =
    await Promise.all([
      Promise.all(
        [CURVE_FACTORY, BONDING_V4_FACTORY].map((target) =>
          options.getLogs({
            target,
            eventAbi: TOKEN_CREATED,
            fromBlock: FROM_BLOCK,
            cacheInCloud: true,
          }),
        ),
      ),
      Promise.all(
        factories.map((target) =>
          options.getLogs({ target, eventAbi: TOKEN_CREATED }),
        ),
      ),
      Promise.all(
        [
          BONDING_V3_ROUTER,
          BONDING_V4_ROUTER,
          V3_SWAP_ROUTER,
          V4_SWAP_ROUTER,
        ].map((target) =>
          options.getLogs({ target, eventAbi: PLATFORM_SWAP_FEE }),
        ),
      ),
      options.getLogs({
        target: V4_SWAP_ROUTER,
        eventAbi: GRADUATED_SWAP,
      }),
    ]);

  for (const _log of dailyCreates.flat()) {
    dailyFees.add(USDC, CREATE_FEE, "Launch Fees");
    dailyRevenue.add(USDC, CREATE_FEE, "Launch Fees");
    dailyProtocolRevenue.add(USDC, CREATE_FEE, "Launch Fees");
  }

  const curves = historicalCreates
    .flat()
    .map((log: any) => log.curve)
    .filter(nonzero);

  if (curves.length) {
    const trades = await options.getLogs({
      targets: curves,
      eventAbi: TRADE,
    });
    for (const log of trades) {
      dailyVolume.add(USDC, log.usdcAmount);
      dailyFees.add(USDC, log.fee, "Bonding Curve Fees");
      const protocol = (BigInt(log.fee) * 20n) / 100n;
      const creator = BigInt(log.fee) - protocol;
      dailyRevenue.add(USDC, protocol, "Bonding Curve Fees To Protocol");
      dailyProtocolRevenue.add(USDC, protocol, "Bonding Curve Fees To Protocol");
      dailySupplySideRevenue.add(USDC, creator, "Creator Fees");
    }
  }

  const [v3BondingFees, v4BondingFees, v3DexFees, v4DexFees] = platformFees;

  for (const log of [...v3BondingFees, ...v4BondingFees]) {
    addPlatformFee(log, d);
  }

  // Instant + graduated V3 via Load router: 0.25% fee ⇒ notional = fee * 400
  for (const log of v3DexFees) {
    dailyVolume.add(USDC, BigInt(log.feeTotal) * 400n);
    addPlatformFee(log, d);
  }

  // Instant + graduated V4: volume from GraduatedSwap; fee split from BondingSwapFeePaid
  for (const log of graduatedSwaps) {
    dailyVolume.add(USDC, log.usdcAmount);
  }
  for (const log of v4DexFees) {
    addPlatformFee(log, d);
  }

  return d;
}

const fetch = async (options: FetchOptions) => {
  const d = await collectLoadDimensions(options);
  return {
    dailyFees: d.dailyFees,
    dailyRevenue: d.dailyRevenue,
    dailyProtocolRevenue: d.dailyProtocolRevenue,
    dailySupplySideRevenue: d.dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1 USDC create fee, 1% bonding-curve trade fee, and 0.25% Load router fee on Instant/graduated swaps.",
  Revenue:
    "Protocol share: all create fees plus 20% of the 1% curve fee (0.20% of curve volume) plus Load router platform fees.",
  ProtocolRevenue: "Same as Revenue — treasury / platform wallets.",
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
