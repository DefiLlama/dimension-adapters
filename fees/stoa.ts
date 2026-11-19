import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";

// Stoa (https://stoadex.com): best-price swap router on Robinhood Chain and Elysium.
// Every settled swap pays Stoa's protocol fee (2 bps): to the router on the final leg, or to each Stoa maker pool
// the route uses (a two-leg route through two Stoa pools pays it on both legs). Both send the fee to the FeeDistributor, which logs FeeNotified with the referrer's share
// (10% when the swap has a referrer). The rest belongs to the protocol. On Robinhood Chain the FeeDistributor is owned
// by StoaBuyback from `buybackFrom`: from then the protocol share can only be swapped into $STOA and burned.

const FEE_NOTIFIED = "event FeeNotified(address indexed from, address indexed token, uint256 amount, address indexed referrer, uint256 toReferrer)";
const ROUTED = "event Routed(address indexed sender, address indexed to, address indexed referrer, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address mid, address venue1, address venue2)";

const LABELS = {
  swapFees: METRIC.SWAP_FEES,
  toReferrers: "Swap Fees To Referrers",
  toTreasury: "Swap Fees To Treasury",
  toBuyback: "Swap Fees To $STOA Buyback",
  buyback: METRIC.TOKEN_BUY_BACK,
};

// `wrapped` is StoaRouter.whype(), the token the router wraps the gas token into (fixed at deployment). It is set here
// instead of read on-chain because public Robinhood Chain RPCs do not serve historical state for backfills.
const chainConfig: Record<string, { router: string; feeDistributor: string; wrapped: string; start: string; buybackFrom?: number }> = {
  [CHAIN.ROBINHOOD]: {
    router: "0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5",
    feeDistributor: "0x76c30317bB8C0bC47E2aC5D83b329FE9F386F4e7",
    wrapped: ADDRESSES.robinhood.WETH,
    start: "2026-11-14",
    // timelock execute that handed the FeeDistributor to StoaBuyback (block 116063184, 16 Nov 2026 21:10:55 UTC):
    // https://robinhoodchain.blockscout.com/tx/0xef3052b0a8b03974ca69ea098181a3863fdbaa9b924498c5e3ec55eeddf5859c
    buybackFrom: 1794863455,
  },
  [CHAIN.ELYSIUM]: {
    router: "0x104752D50ef893da579Ad813918269e09Ea17dbA",
    feeDistributor: "0x19C1C6b5924C3257a03D29b2DB0Acd9d4492aD1e",
    wrapped: ADDRESSES.elysium.WHYPE,
    start: "2026-11-12",
  },
};

const fetch = async (options: FetchOptions) => {
  const { chain, getLogs, createBalances, startTimestamp } = options;
  const { router, feeDistributor, buybackFrom } = chainConfig[chain];
  const wrapped = chainConfig[chain].wrapped.toLowerCase();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const result = { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };

  const fees = await getLogs({ target: feeDistributor, eventAbi: FEE_NOTIFIED, onlyArgs: false });
  if (!fees.length) return result;

  // The fee is paid in the swap's output token, which can be a long-tail token. When that token is not a core asset, the fee
  // is valued on the swap's input side instead, in proportion: fee / (amountOut + fee) of amountIn. The router and the
  // pools call notifyFee inside the swap itself (StoaRouter._adapterLeg, StoaPool.swap), so a fee and its Routed event
  // always share a transaction.
  const routed = await getLogs({ target: router, eventAbi: ROUTED, onlyArgs: false });
  const swapOf: Record<string, any> = {};
  for (const l of routed) swapOf[l.transactionHash.toLowerCase()] = l.args;
  const asWrapped = (t: string) => (t.toLowerCase() === ADDRESSES.null ? wrapped : t.toLowerCase());

  const add = (balances: any, token: string, part: bigint, total: bigint, swap: any, label: string) => {
    if (part === 0n) return;
    const out = swap && asWrapped(swap.tokenOut) === token ? BigInt(swap.amountOut) : 0n;
    if (out === 0n) return balances.add(token, part, label);
    const inPart = (BigInt(swap.amountIn) * part) / (out + total);
    addOneToken({ chain, balances, token0: token, amount0: part, token1: asWrapped(swap.tokenIn), amount1: inPart, label });
  };

  const toBuyback = buybackFrom !== undefined && startTimestamp >= buybackFrom;
  for (const l of fees) {
    const token = l.args.token.toLowerCase();
    const amount = BigInt(l.args.amount);
    const toReferrer = BigInt(l.args.toReferrer);
    const protocol = amount - toReferrer;
    const swap = swapOf[l.transactionHash.toLowerCase()];
    add(dailyFees, token, amount, amount, swap, LABELS.swapFees);
    add(dailySupplySideRevenue, token, toReferrer, amount, swap, LABELS.toReferrers);
    add(dailyRevenue, token, protocol, amount, swap, toBuyback ? LABELS.toBuyback : LABELS.toTreasury);
    if (toBuyback) add(dailyHoldersRevenue, token, protocol, amount, swap, LABELS.buyback);
    else add(dailyProtocolRevenue, token, protocol, amount, swap, LABELS.toTreasury);
  }
  return result;
};

const methodology = {
  Fees: "Stoa's protocol fee (2 bps of the output) paid on every swap routed through Stoa on Robinhood Chain and Elysium.",
  Revenue: "Stoa's protocol fee on every swap, minus the 10% share credited to the swap's referrer when it has one.",
  ProtocolRevenue: "The protocol's share of the swap fee kept by the Stoa treasury: on Elysium, and on Robinhood Chain before the fees were handed to the $STOA buyback.",
  HoldersRevenue: "On Robinhood Chain since the buyback handover, the protocol's share of the swap fee, which can only be swapped into $STOA and burned.",
  SupplySideRevenue: "The 10% share of the swap fee credited to the referrer of each referred swap.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.swapFees]: "2 bps protocol fee charged by the router on the final leg, or by each Stoa maker pool a swap goes through.",
  },
  Revenue: {
    [LABELS.toTreasury]: "Protocol share of the swap fee kept by the Stoa treasury.",
    [LABELS.toBuyback]: "Protocol share of the swap fee reserved for StoaBuyback, which buys $STOA and burns it.",
  },
  ProtocolRevenue: {
    [LABELS.toTreasury]: "Protocol share of the swap fee kept by the Stoa treasury.",
  },
  HoldersRevenue: {
    [LABELS.buyback]: "Protocol share of the swap fee used to buy $STOA and burn it.",
  },
  SupplySideRevenue: {
    [LABELS.toReferrers]: "10% of the swap fee credited to the referrer of the swap.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
