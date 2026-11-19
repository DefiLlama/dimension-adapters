// Homer: the liquidity layer of Elysium (https://homer.finance, https://x.com/homer_fi).
// Fees Homer's contracts take or route, from their own events:
//  - LP fees collected from positions opened through Homer (HomerLiquidityManager for v3,
//    HomerV4Manager for v4): FeesCollected splits each collection into the LP's part and Homer's part.
//  - Homer Swap's fee on every trade routed through it (Swapped.fee, native HYPE).
//  - The Homer pool hook's cut of every swap in pools created on Homer (HomerFee).
// Homer's part goes to HomerFeeRouter, which streams `stakerBps` of it to $HOMER stakers
// (60% at the time of writing) and sends the rest to the team.
// Contracts are verified on Kinetiq's explorer: https://elysium.kinetiq.xyz
// Address source: the current contracts are in Homer's contract list (https://homer.finance/docs,
// Contracts section; JSON at https://homer.finance/api/contracts). The others are the earlier versions
// they replaced, deployed by the same owner (0x206e52b4b2ef813a1b34793091c9b87761e775f4); each one
// can be checked at https://elysium.kinetiq.xyz/address/<address>.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Every HomerLiquidityManager version (v3 positions) and HomerV4Manager version (v4 positions):
// positions opened in an earlier version keep collecting fees there.
const LIQUIDITY_MANAGERS = [
  "0xff60e4f370c0243a820e0864ca92e1eb6ab7937e",
  "0xfcbd0977c9e610a1d53f56746d7b6cc5fb5fb9b9",
  "0x9ba039830404b8f658f8a79e774338cad510621a",
  "0xa70551dc12b4c2cd52b4a91127a204e8eb233d10",
  "0xdb61b2fba50ced1f6271963d9e357ed9d2136420",
  "0x2168787fa608338be994ba7e0e3852589ae0715f",
  "0xcf76489a3f2bda1a15825a600ef25d28315cf83c",
  "0x63b202b8c36b0cd35782af0068d0a60fd1394b86",
];
// Every Homer Swap version (fee: 0.25% of the HYPE side of each trade).
const HOMER_SWAPS = [
  "0xcdef14ba5177ec3700067a70ca1f21c9d3415489",
  "0x1cae4a793ce7b8ed136d1143ed31e402f9b53873",
  "0xa9967eaba36531526a1458aed9b16453adcfb7e9",
];
const POOL_HOOK = "0x1295bd9d641185f361016a898a61a801c0d3e044";
const FEE_ROUTER = "0x4163dba007351b9d23691e1eaaa687db0d3e92ed";

const FEES_COLLECTED = "event FeesCollected(address indexed user, address indexed manager, uint256 indexed tokenId, address token0, address token1, uint256 lp0, uint256 lp1, uint256 fee0, uint256 fee1)";
const SWAPPED = "event Swapped(address indexed user, address indexed target, address indexed token, bool buy, uint256 hypeAmount, uint256 tokenAmount, uint256 fee)";
const HOMER_FEE = "event HomerFee(bytes32 indexed poolId, address indexed currency, uint256 amount)";

const SWAP_FEE = "Homer Swap fees";
const HOOK_FEE = "Homer pool hook fees";

const NATIVE = ADDRESSES.null;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  // Homer's share of every fee, by token: the fee router splits HYPE and pays other tokens to the team.
  const revenue: { token: string; amount: bigint; label: string }[] = [];

  const collects = await options.getLogs({ targets: LIQUIDITY_MANAGERS, eventAbi: FEES_COLLECTED });
  for (const l of collects) {
    dailyFees.add(l.token0, l.lp0, METRIC.LP_FEES);
    dailyFees.add(l.token1, l.lp1, METRIC.LP_FEES);
    dailySupplySideRevenue.add(l.token0, l.lp0, METRIC.LP_FEES);
    dailySupplySideRevenue.add(l.token1, l.lp1, METRIC.LP_FEES);
    dailyFees.add(l.token0, l.fee0, METRIC.LP_FEES);
    dailyFees.add(l.token1, l.fee1, METRIC.LP_FEES);
    revenue.push({ token: l.token0, amount: BigInt(l.fee0), label: METRIC.LP_FEES });
    revenue.push({ token: l.token1, amount: BigInt(l.fee1), label: METRIC.LP_FEES });
  }

  const swaps = await options.getLogs({ targets: HOMER_SWAPS, eventAbi: SWAPPED });
  for (const l of swaps) {
    dailyFees.addGasToken(l.fee, SWAP_FEE);
    revenue.push({ token: NATIVE, amount: BigInt(l.fee), label: SWAP_FEE });
  }

  const hookFees = await options.getLogs({ target: POOL_HOOK, eventAbi: HOMER_FEE });
  for (const l of hookFees) {
    dailyFees.add(l.currency, l.amount, HOOK_FEE);
    revenue.push({ token: l.currency, amount: BigInt(l.amount), label: HOOK_FEE });
  }

  // The fee router splits only HYPE between stakers and the team: native HYPE, its reward token
  // (WHYPE) and the other venues' wrapped HYPE it unwraps (isWrapped). Fees in any other token can
  // only be forwarded to the team, so they are all protocol revenue.
  const tokens = [...new Set(revenue.map((r) => r.token.toLowerCase()))].filter((t) => t !== NATIVE);
  const [stakerBpsRaw, rewardToken, wrapped] = await Promise.all([
    options.api.call({ target: FEE_ROUTER, abi: "uint16:stakerBps" }),
    options.api.call({ target: FEE_ROUTER, abi: "address:rewardToken" }),
    tokens.length
      ? options.api.multiCall({ abi: "function isWrapped(address) view returns (bool)", calls: tokens.map((t) => ({ target: FEE_ROUTER, params: [t] })) })
      : Promise.resolve([]),
  ]);
  const stakerBps = BigInt(stakerBpsRaw); // 6000 = 60% at the time of writing
  const hype = new Set<string>([NATIVE, String(rewardToken).toLowerCase(), ...tokens.filter((_, i) => wrapped[i])]);

  const add = (b: any, token: string, amount: bigint, label: string) => {
    if (amount <= 0n) return;
    if (token.toLowerCase() === NATIVE) b.addGasToken(amount.toString(), label);
    else b.add(token, amount.toString(), label);
  };
  for (const r of revenue) {
    add(dailyRevenue, r.token, r.amount, r.label);
    if (hype.has(r.token.toLowerCase())) {
      const toStakers = (r.amount * stakerBps) / 10_000n;
      add(dailyHoldersRevenue, r.token, toStakers, r.label);
      add(dailyProtocolRevenue, r.token, r.amount - toStakers, r.label);
    } else {
      add(dailyProtocolRevenue, r.token, r.amount, r.label);
    }
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Trading fees earned by liquidity positions opened through Homer (counted when collected), Homer Swap's routing fee on every trade it routes, and the Homer pool hook's fee on swaps in pools created on Homer.",
  UserFees: "Fees paid by traders: the pool trading fees earned by positions opened through Homer, Homer Swap's routing fee and the Homer pool hook's fee.",
  Revenue: "Homer's cut of the trading fees collected by positions opened through Homer (14% as of November 2026, capped at 25% by the contracts) plus all Homer Swap and pool hook fees, all sent to Homer's fee router.",
  ProtocolRevenue: "The part of Homer's revenue that goes to the team: the share of HYPE fees not paid to $HOMER stakers (40% as of November 2026) and all fees paid in other tokens.",
  HoldersRevenue: "The share of Homer's HYPE and wrapped HYPE revenue that the fee router streams to $HOMER stakers (60% as of November 2026); fees in other tokens go only to the team.",
  SupplySideRevenue: "The trading fees collected by positions opened through Homer that stay with the liquidity providers who own them (86% as of November 2026).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "Trading fees earned by liquidity positions opened through Homer on Elysium DEXs (Uniswap v4, KleosSwap, ElysPump and others), counted when the owner collects them, including both the liquidity provider's part and Homer's cut.",
    [SWAP_FEE]: "Homer Swap's routing fee, 0.25% of the HYPE side of every trade it routes as of November 2026; the pool fees on those trades go to the pools' own liquidity providers and are not counted.",
    [HOOK_FEE]: "The fee the Homer pool hook takes on every swap in pools created on Homer.",
  },
  Revenue: {
    [METRIC.LP_FEES]: "Homer's cut of the collected LP fees (14% as of November 2026), sent to Homer's fee router.",
    [SWAP_FEE]: "All Homer Swap routing fees, sent to Homer's fee router.",
    [HOOK_FEE]: "All Homer pool hook fees, sent to Homer's fee router.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "The rest of the collected LP fees (86% as of November 2026), kept by the liquidity providers who own the positions.",
  },
  HoldersRevenue: {
    [METRIC.LP_FEES]: "The $HOMER stakers' share (60% as of November 2026) of Homer's cut of LP fees, when that cut is paid in HYPE or wrapped HYPE.",
    [SWAP_FEE]: "The $HOMER stakers' share (60% as of November 2026) of Homer Swap fees, which are always paid in HYPE.",
    [HOOK_FEE]: "The $HOMER stakers' share (60% as of November 2026) of Homer pool hook fees, when they are paid in HYPE or wrapped HYPE.",
  },
  ProtocolRevenue: {
    [METRIC.LP_FEES]: "The team's part of Homer's cut of LP fees: the remaining 40% when paid in HYPE, and all of it when paid in other tokens.",
    [SWAP_FEE]: "The team's part of Homer Swap fees, the remaining 40% as of November 2026.",
    [HOOK_FEE]: "The team's part of Homer pool hook fees: the remaining 40% when paid in HYPE, and all of it when paid in other tokens.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-30",
  methodology,
  breakdownMethodology,
};

export default adapter;
