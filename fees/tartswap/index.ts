import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

/**
 * TartSwap — router swap fees on BNB Smart Chain.
 *
 * TartSwapRouterV2 (0xBd9Ab53ebfb53F4436c829E881B5e560868D840F) wraps the
 * PancakeSwap V2 router and takes a fee on the input leg of every swap
 * (35 bps by default; accounts with a custom fee, e.g. fee-exempt market
 * makers, pay `feeBpsApplied`, which can be 0). Every swap emits
 * `TartSwapExecuted` carrying the exact fee taken (`feeAmount`, denominated in
 * `tokenIn`; `tokenIn == address(0)` is native BNB).
 *
 * The fee is pushed to TartFeeDistributor
 * (0xdf0aC48105BbC66EBe2976b03097A87Bb80744c1), whose owner-set `split()`
 * decides where it goes:
 *   treasury + reserve legs  -> the protocol (dailyRevenue / dailyProtocolRevenue)
 *   farm + staking legs      -> recycled into farm/staking reward pools for LP
 *                               and CREPE stakers (dailySupplySideRevenue)
 * The split is read on chain at the end block of the period, so a governance
 * change to the split is reflected without touching the adapter. The
 * constructor default was 40/30/20/10; the split was later set to 100/0/0/0
 * (all treasury).
 *
 * PancakeSwap's own 25 bps LP fee on the forwarded swap is PancakeSwap's fee,
 * not TartSwap's, and is not counted here.
 */
const ROUTER = "0xBd9Ab53ebfb53F4436c829E881B5e560868D840F";
const FEE_DISTRIBUTOR = "0xdf0aC48105BbC66EBe2976b03097A87Bb80744c1";
const BPS = 10_000n;

const TART_SWAP_EXECUTED =
  "event TartSwapExecuted(address indexed user, address indexed caller, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountInAfterFee, uint256 amountOut, uint256 feeAmount, uint16 feeBpsApplied, uint8 feeTier, bool feeOnTransferSupporting)";
const SPLIT_ABI =
  "function split() view returns (address treasury, address farmRewards, address stakingRewards, address reserve, uint16 treasuryBps, uint16 farmBps, uint16 stakingBps, uint16 reserveBps)";

const LABEL_TREASURY = "Swap Fees To Treasury";
const LABEL_REWARDS = "Swap Fees To Farm And Staking Rewards";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const split = await options.api.call({ target: FEE_DISTRIBUTOR, abi: SPLIT_ABI });
  const protocolBps = BigInt(split.treasuryBps) + BigInt(split.reserveBps);
  const supplyBps = BigInt(split.farmBps) + BigInt(split.stakingBps);

  const logs = await options.getLogs({ target: ROUTER, eventAbi: TART_SWAP_EXECUTED });
  for (const log of logs) {
    const fee = BigInt(log.feeAmount);
    if (fee === 0n) continue;
    dailyFees.add(log.tokenIn, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(log.tokenIn, (fee * protocolBps) / BPS, LABEL_TREASURY);
    dailySupplySideRevenue.add(log.tokenIn, (fee * supplyBps) / BPS, LABEL_REWARDS);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Router fee taken on the input leg of every swap through TartSwapRouterV2 (TartSwapExecuted.feeAmount, 35 bps by default, per-account custom fees possible). Excludes PancakeSwap's LP fee on the forwarded swap.",
  UserFees: "Same as Fees: the router fee is paid entirely by the swapper.",
  Revenue: "Share of the fee that TartFeeDistributor routes to the treasury and reserve legs, per its on-chain split() at the end of the period.",
  ProtocolRevenue: "Same as Revenue: the treasury and reserve legs are held by the protocol.",
  SupplySideRevenue: "Share of the fee that TartFeeDistributor routes to the farm and staking reward legs, which are converted and streamed to LP and CREPE stakers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "TartSwapExecuted.feeAmount on every router swap, denominated in the input token.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "The router fee is paid by the swapper on the input leg.",
  },
  Revenue: {
    [LABEL_TREASURY]: "Treasury + reserve share of the router fee per TartFeeDistributor.split().",
  },
  ProtocolRevenue: {
    [LABEL_TREASURY]: "Treasury + reserve share of the router fee per TartFeeDistributor.split().",
  },
  SupplySideRevenue: {
    [LABEL_REWARDS]: "Farm + staking share of the router fee per TartFeeDistributor.split(), recycled into reward pools.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-08-31",
  methodology,
  breakdownMethodology,
};

export default adapter;
