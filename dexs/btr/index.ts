import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// BTR: oracle-priced multi-asset AMM. One protocol, one series across pool versions.
// Every fill emits one canonical `Swapped` event on the pool:
// `amounts` is packed `amountIn | amountOut << 128` and `fees` is `protoFee | lpFee << 128`. The
// whole fee is charged on the output leg, in `tokenOut` units; there is no input-leg fee and no
// separate fee-transfer transaction (source: dex-evm/src/interfaces/IPool.sol `Swapped`,
// dex-evm/src/libraries/PricingLib.sol `_settleAndPay`).
//
// Volume counts EVERY fill, including BTR's own coop-arbitrage fills. `Pool.swapCoop_cd` is
// callable only by addresses holding the COOP_ENABLED permission bit, which is granted only to
// BTR's own CoopArb contracts (protocol-owned atomic arbitrage). Those fills are real pool swaps:
// they move inventory against external venues and pay a non-zero LP fee, so excluding them left the
// whole series at zero while coop arb was the only flow. They are included here by the protocol's
// listing decision.
// Coop fills pay the protocol fee: the coop discount cuts the LP fee share only. The first
// generation contract booked a protocol fee of 0 on every coop fill (612 of 612 on chain), so those
// days show LP fees with zero revenue; the current contract pays it in full.
//
// Fees vs revenue follows the DefiLlama convention (and Uniswap's own listing): `fees` is the whole
// swap fee the taker paid (LP share + protocol share), `revenue` is the protocol's share of it, and
// `supplySideRevenue` is the LP share. Uniswap reports swap fees as LP fees where its protocol fee
// is off, and protocol revenue only where a protocol fee is switched on; the two are the same
// identity, and a DEX with no protocol fee correctly reports zero revenue while its fees stay
// non-zero.
//
// Liability conversions are volume too. `LiabilitySwapped` is emitted by `withdrawTo` when the
// LP exits into ANOTHER token than its claim (a cross-asset exit: the claim is converted through
// the same anchor-path quote a swap uses, then paid out) and by `swapLiability` (the claim is
// re-denominated into another leg, nothing paid out). Each is counted ONCE, on its output leg:
// - cross exit (`lpAmountOut == 0`): the pool's next `Withdrawn(sender, tokenOut, amount, 0)` in
//   the same transaction is the payout; `amount` of `tokenOut` is the volume, and that Withdrawn
//   is never counted again (a same-asset withdraw is liquidity, not volume);
// - `swapLiability` (`lpAmountOut > 0`): the minted claim's token value, `previewWithdraw` face
//   (amountOut + haircut) of `lpAmountOut` `tokenOut` shares at the window's end block.
// `LiabilitySwapped` carries the route fee (`fees`, route-only, tokenOut units), booked like a swap
// fee, protocol and LP shares apart; its `tolls`, like a swap's coverage toll, are not fees.
// Event shapes match dex-evm abi/events.json (Swapped, LiabilitySwapped, Withdrawn).
// Pools come from the PoolFactory contracts (official pools), resolved at the window's end block,
// so a new pool or factory generation needs no change here beyond a new factory address. The first
// generation stays listed: it keeps pre-v2 days resolving and holds its LPs' liquidity while it
// winds down. Both emit `Swapped` and `Withdrawn` alike; `LiabilitySwapped` has two shapes (below).
const factoryAbi = {
  count: "uint256:getOfficialPoolsCount",
  pool: "function officialPools(uint256) view returns (address)",
};

const getPools = async (options: FetchOptions): Promise<string[]> => {
  // A factory is skipped only before its first pool exists (`from`). Every other factory must
  // resolve: a failed call throws, it never becomes zero pools.
  const factories = chainConfig[options.chain].factories
    .filter((f) => options.toTimestamp >= f.from)
    .map((f) => f.address);
  const counts = await options.api.multiCall({ abi: factoryAbi.count, calls: factories });
  const calls: { target: string; params: [number] }[] = [];
  factories.forEach((target, i) => {
    for (let j = 0; j < Number(counts[i]); j++) calls.push({ target, params: [j] });
  });
  const pools = await options.api.multiCall({ abi: factoryAbi.pool, calls });
  if (pools.some((p: any) => !p)) throw new Error("btr: pool discovery failed");
  return pools;
};

const SWAPPED =
  "event Swapped(address indexed sender, address indexed recipient, address indexed tokenIn, address tokenOut, uint256 amounts, uint256 fees, uint256 prices, uint256 outBook, uint256 outState)";

// First generation shape: no fee or toll fields, so its conversions add volume only. The second
// generation appends `fees` (route-only, protoFee | lpFee << 128) and `tolls` (coverage toll |
// debit toll << 128), tokenOut units. Trailing fields make a new topic0, so both are read.
const LIABILITY_SWAPPED_V1 =
  "event LiabilitySwapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 lpAmountIn, uint256 lpAmountOut, uint256 haircut)";
const LIABILITY_SWAPPED =
  "event LiabilitySwapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 lpAmountIn, uint256 lpAmountOut, uint256 haircut, uint256 fees, uint256 tolls)";
const WITHDRAWN =
  "event Withdrawn(address indexed sender, address indexed token, uint256 amount, uint256 lpAmount)";

const abi = {
  previewWithdraw: "function previewWithdraw(address tk, uint256 lp) view returns (uint256 amountOut, uint256 haircut)",
};

const U128 = (1n << 128n) - 1n;

// Only chains with a live deployment are listed (Monad, chain 143).
const chainConfig: Record<string, { start: string; factories: { address: string; from: number }[] }> = {
  [CHAIN.MONAD]: {
    start: "2026-10-01", // first pool, block 109610388
    factories: [
      // current generation (pool deployed at block 121555891, 2026-11-12)
      { address: "0xbbbbbbb16b9B5Fa94AD8CD35e696bEA55DB9C8B0", from: 1794472602 },
      // first generation
      { address: "0xbbbbbbbbbd5e955E20F323cA1F95f8191fD0E0BF", from: 0 },
    ],
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const pools = await getPools(options);
  if (!pools.length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  const logs = await options.getLogs({ targets: pools, eventAbi: SWAPPED });

  const lower = (a: string) => a.toLowerCase();
  const positioned = (eventAbi: string): Promise<any[]> =>
    options.getLogs({ targets: pools, eventAbi, entireLog: true, parseLog: true });
  const liabilityLogs = [...(await positioned(LIABILITY_SWAPPED_V1)), ...(await positioned(LIABILITY_SWAPPED))];
  const withdrawLogs = await positioned(WITHDRAWN);
  const txPool = (l: any) => `${lower(l.transactionHash)}|${lower(l.address)}`;
  const conversionsAt = new Map<string, number[]>();
  for (const l of liabilityLogs) conversionsAt.set(txPool(l), [...(conversionsAt.get(txPool(l)) ?? []), Number(l.logIndex)]);
  const payouts = new Map<string, any[]>();
  for (const w of withdrawLogs) {
    payouts.set(txPool(w), [...(payouts.get(txPool(w)) ?? []), w]);
  }
  const mints: { pool: string; token: string; lp: bigint }[] = [];
  for (const l of liabilityLogs) {
    const { sender, tokenOut, lpAmountOut, fees } = l.args;
    const protoFee = BigInt(fees ?? 0) & U128;
    const lpFee = BigInt(fees ?? 0) >> 128n;
    dailyFees.add(tokenOut, protoFee + lpFee, "Conversion Fees");
    dailyRevenue.add(tokenOut, protoFee, "Conversion Fees To Protocol");
    dailySupplySideRevenue.add(tokenOut, lpFee, "Conversion Fees To LPs");
    if (BigInt(lpAmountOut) > 0n) {
      mints.push({ pool: l.address, token: tokenOut, lp: BigInt(lpAmountOut) });
      continue;
    }
    // The cross exit's payout: the pool's first lpAmount-0 Withdrawn after it in the same
    // transaction, before the pool's next conversion. A same-asset withdraw always burns shares,
    // so it is never taken for the payout.
    const at = Number(l.logIndex);
    const until = Math.min(...(conversionsAt.get(txPool(l)) ?? []).filter((i) => i > at), Infinity);
    const next = (payouts.get(txPool(l)) ?? [])
      .filter((w) => Number(w.logIndex) > at && Number(w.logIndex) < until && BigInt(w.args.lpAmount) === 0n)
      .sort((a, b) => Number(a.logIndex) - Number(b.logIndex))[0];
    if (next && lower(next.args.token) === lower(tokenOut) && lower(next.args.sender) === lower(sender))
      dailyVolume.add(tokenOut, next.args.amount);
  }
  if (mints.length) {
    const previews = await options.api.multiCall({
      abi: abi.previewWithdraw,
      calls: mints.map((m) => ({ target: m.pool, params: [m.token, m.lp.toString()] })),
    });
    previews.forEach((p: any, i: number) =>
      dailyVolume.add(mints[i].token, BigInt(p.amountOut) + BigInt(p.haircut))
    );
  }

  for (const log of logs) {
    const amounts = BigInt(log.amounts);
    const fees = BigInt(log.fees);
    const protoFee = fees & U128;
    const lpFee = fees >> 128n;
    // Input-leg amount only, counted once per fill: the input leg is the notional the taker
    // actually moved, and the fee is charged on the output leg so it is not double-counted here.
    dailyVolume.add(log.tokenIn, amounts & U128);
    dailyFees.add(log.tokenOut, protoFee + lpFee, "Swap Fees");
    dailyRevenue.add(log.tokenOut, protoFee, "Swap Fees To Protocol");
    dailySupplySideRevenue.add(log.tokenOut, lpFee, "Swap Fees To LPs");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Input-token amount (amountIn) of every swap on BTR pools, read from the pool Swapped event and counted once per swap, including the protocol's own coop-arbitrage fills (CoopArb). Plus every liability conversion (LiabilitySwapped), counted once on its output leg: a cross-asset withdrawal (withdrawTo into another token) counts the token it paid out, read from its paired Withdrawn; a swapLiability counts the value of the claim it minted.",
  Fees:
    "Swap fee charged on the output token of each swap (protocol share plus LP share), read from the Swapped event, plus the route-only fee a liability conversion logs on LiabilitySwapped. The coverage toll a swap may pay when it drains a leg below its coverage floor, and the coverage and debit tolls a conversion logs, stay in the leg's reserves as a buffer and are not counted.",
  UserFees: "All swap fees are paid by the swapper.",
  Revenue: "Protocol share (protoFee) of the swap fee.",
  ProtocolRevenue: "The protocol share (protoFee) of the swap fee goes to the BTR treasury.",
  SupplySideRevenue: "LP share (lpFee) of the swap fee, accrued to the liquidity providers of the output leg.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Swap fee charged on the output token of each swap (protocol share plus LP share).",
    "Conversion Fees": "Route fee a liability conversion charged on its output token (protocol share plus LP share), read from LiabilitySwapped.",
  },
  UserFees: {
    "Swap Fees": "Swap fee charged on the output token of each swap (protocol share plus LP share).",
    "Conversion Fees": "Route fee a liability conversion charged on its output token.",
  },
  Revenue: {
    "Swap Fees To Protocol": "Protocol share (protoFee) of the swap fee.",
    "Conversion Fees To Protocol": "Protocol share of a liability conversion's route fee.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "Protocol share (protoFee) of the swap fee, sent to the BTR treasury.",
    "Conversion Fees To Protocol": "Protocol share of a liability conversion's route fee, booked to the BTR treasury.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "LP share (lpFee) of the swap fee, accrued to the output leg's liquidity providers.",
    "Conversion Fees To LPs": "LP share of a liability conversion's route fee, accrued to the output leg's LPs.",
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
