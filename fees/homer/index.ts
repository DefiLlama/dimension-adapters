// Homer: the liquidity layer of Elysium (https://homer.finance, https://x.com/homer_fi).
// Fees Homer's contracts take or route, from their own events:
//  - LP fees collected from positions opened through Homer (HomerLiquidityManager for v3,
//    HomerV4Manager for v4): FeesCollected splits each collection into the LP's part and Homer's part.
//  - Homer Swap's fee on every trade routed through it (Swapped.fee, native HYPE).
//  - The Homer pool hook's cut of every swap in pools created on Homer (HomerFee).
// Homer's part goes to HomerFeeRouter, which streams `stakerBps` of it to $HOMER stakers
// (60% at the time of writing) and sends the rest to the team.
// Contracts are verified on Kinetiq's explorer: https://elysium.kinetiq.xyz
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { CHAIN } from "../../helpers/chains";

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

const HOMER_LP_SHARE = "Homer share of LP fees";
const SWAP_FEE = "Homer Swap fees";
const HOOK_FEE = "Homer pool hook fees";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const collects = await options.getLogs({ targets: LIQUIDITY_MANAGERS, eventAbi: FEES_COLLECTED });
  for (const l of collects) {
    dailyFees.add(l.token0, l.lp0, METRIC.LP_FEES);
    dailyFees.add(l.token1, l.lp1, METRIC.LP_FEES);
    dailySupplySideRevenue.add(l.token0, l.lp0, METRIC.LP_FEES);
    dailySupplySideRevenue.add(l.token1, l.lp1, METRIC.LP_FEES);
    dailyFees.add(l.token0, l.fee0, HOMER_LP_SHARE);
    dailyFees.add(l.token1, l.fee1, HOMER_LP_SHARE);
    dailyRevenue.add(l.token0, l.fee0, HOMER_LP_SHARE);
    dailyRevenue.add(l.token1, l.fee1, HOMER_LP_SHARE);
  }

  const swaps = await options.getLogs({ targets: HOMER_SWAPS, eventAbi: SWAPPED });
  for (const l of swaps) {
    dailyFees.addGasToken(l.fee, SWAP_FEE);
    dailyRevenue.addGasToken(l.fee, SWAP_FEE);
  }

  const hookFees = await options.getLogs({ target: POOL_HOOK, eventAbi: HOMER_FEE });
  for (const l of hookFees) {
    dailyFees.add(l.currency, l.amount, HOOK_FEE);
    dailyRevenue.add(l.currency, l.amount, HOOK_FEE);
  }

  // The fee router's current staker share, in basis points (6000 = 60%).
  const stakerBps = Number(await options.api.call({ target: FEE_ROUTER, abi: "uint16:stakerBps" }));
  const dailyHoldersRevenue = dailyRevenue.clone(stakerBps / 10_000);
  const dailyProtocolRevenue = dailyRevenue.clone(1 - stakerBps / 10_000);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Trading fees collected from liquidity positions opened through Homer, Homer Swap's 0.25% fee on routed trades, and the Homer pool hook's cut of swaps in pools created on Homer.",
  UserFees: "Same as Fees: paid by traders and by liquidity providers' collected fees.",
  Revenue: "Homer's share of collected LP fees (set per manager, 14% at the time of writing, capped at 25% by the contract), plus all Homer Swap and pool hook fees. All of it goes to the Homer fee router.",
  ProtocolRevenue: "The part of revenue the fee router sends to the team (100% minus the staker share).",
  HoldersRevenue: "The part of revenue the fee router streams to $HOMER stakers, in HYPE (stakerBps on the fee router, 60% at the time of writing).",
  SupplySideRevenue: "The rest of the collected LP fees, paid to the liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "Trading fees earned by positions opened through Homer, paid to their liquidity providers.",
    [HOMER_LP_SHARE]: "Homer's share of those collected LP fees.",
    [SWAP_FEE]: "0.25% of the HYPE side of every trade routed through Homer Swap.",
    [HOOK_FEE]: "The Homer pool hook's cut of every swap in pools created on Homer.",
  },
  Revenue: {
    [HOMER_LP_SHARE]: "Homer's share of collected LP fees, sent to the fee router.",
    [SWAP_FEE]: "All Homer Swap fees, sent to the fee router.",
    [HOOK_FEE]: "All pool hook fees, sent to the fee router.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Collected LP fees kept by the liquidity providers.",
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
