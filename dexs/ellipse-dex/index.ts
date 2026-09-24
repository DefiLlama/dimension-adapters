import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Ellipse's own markets on Arc - the RWA pools it opened for the assets it bridges,
// and the market for its own token. Ellipse runs these on Uniswap rather than on an
// AMM of its own, some of them through a hook it wrote, so the pools are enumerated
// here one by one instead of being discovered from a factory.
//
// WHAT IS IN, AND WHY IT IS A SHORT LIST. The test is that both sides of the pool are
// assets Ellipse issues: its bridged claim tokens bCRCL, bGLD, bBTCB and bUSDT, its
// own token, and USDC. That is a property of the pool rather than a judgement about
// it, so it can be checked from outside.
//
// WHAT IS OUT, AND IT IS NOT NOTHING:
//
//  - Launchpad launches. Those pools are opened for other people's tokens, on
//    Uniswap's shared PoolManager, with no bonding-curve stage, so their volume is
//    the DEX's and not Ellipse's - the same call the fees/ellipse adapter already
//    makes, in the same words. 60 pools, about 4% of the volume that touches Ellipse
//    at all, and five dollars of it in the last day.
//
//  - The cirBTC/USDC pool, and this one is expensive to leave out. Ellipse opened it
//    and provides its liquidity, it is on the protocol's own pools page, and it is
//    busy: measured over 24 hours, 18,535 swaps, one every 4.7 seconds, 5.6M dollars
//    on the USDC side - more than everything below put together, several times over.
//    It is out because both of its tokens are Circle's, not Ellipse's, and opening a
//    pool for someone else's pair is the same claim the launchpad launches make. If
//    this project's volume is to be believed, the rule has to hold where it costs
//    something, not only where it is free.
//
// The one pool that genuinely sits between the two is ELLIPSE/bCRCL, which the
// protocol's own indexer labels a launch market and which is the largest single pool
// left. It is in, on the same test as the rest: both of its sides are assets Ellipse
// issues, so it is the market for the protocol's own token, not someone else's launch.
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";

// THE SIDE THAT IS MEASURED. A swap moves two tokens and counting both would double
// it, so each pool is measured on one side, and that side is chosen to be the one
// with a price rather than the one that happens to be currency0. That is USDC
// everywhere except the ELLIPSE market, where it is bCRCL.
//
// bCRCL has no price of its own anywhere - it is a 1:1 claim, and its worth is the
// CRCL held in custody on Robinhood Chain, which DefiLlama already prices and already
// counts for this protocol's TVL. So the bCRCL side is valued as that CRCL.
const USDC = "0x3600000000000000000000000000000000000000";
const CRCL_ON_ORIGIN = "robinhood:0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5";

// Uniswap v4 puts every pool's swaps on one shared PoolManager and names the pool by
// id, so these are filtered by id. v4 reports the fee it actually charged on each
// swap, which matters here: two of these pools carry Ellipse's market-hours hook and
// charge 1%, 2% or 3% depending on whether the underlying market is open, so a fixed
// rate would be wrong for them and there is no need to guess one.
const SWAP_V4 =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
// v3 pools are their own contract and their fee is fixed at creation, so it is held
// here beside the address.
const SWAP_V3 =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

type Pool = {
  pair: string;
  // The token the volume is measured in, and which of the two swap amounts carries
  // it. Both sides are fixed by Uniswap's address ordering, so this is not a choice.
  token: string;
  amount0: boolean;
  crossChain?: boolean;
};

const V4_POOLS: (Pool & { id: string })[] = [
  {
    pair: "bCRCL/USDC, market-hours hook",
    id: "0xd3fd0ecc36bbd15bfed676a2fd494ae4102116f02e0f45156d5972932d65c241",
    token: USDC,
    amount0: true,
  },
  {
    pair: "bCRCL/USDC 1%",
    id: "0xbedc196c251a8a47fa0e1c3f1a54319c6c88c0a8b276b96a7f1f4aef8a7ded37",
    token: USDC,
    amount0: true,
  },
  {
    pair: "bGLD/USDC, market-hours hook",
    id: "0x36b5b88806d606da03e85312a85223a3c71b1bf8c6eb24908e391a8873a3ad3d",
    token: USDC,
    amount0: false,
  },
  {
    pair: "bGLD/USDC 1%",
    id: "0x58e540c640f6fe9984cb39cb803c975de21339f4870b85bc9731cfddd877d6a7",
    token: USDC,
    amount0: false,
  },
];

// `fee` is in hundredths of a bip, the same scale v4 reports: 10000 = 1%.
const V3_POOLS: (Pool & { address: string; fee: number })[] = [
  { pair: "ELLIPSE/bCRCL 1%", address: "0x0Abd501F56CD434D346CD5Bf3B67aEF461ebBc2d", token: CRCL_ON_ORIGIN, amount0: false, crossChain: true, fee: 10000 },
  { pair: "bCRCL/USDC 1%", address: "0x8b3F1194F8a2D067fa91D2E8073b27B710062347", token: USDC, amount0: true, fee: 10000 },
  { pair: "bGLD/USDC 1%", address: "0xC4bB8F51E1732e80d16929180e2A9387E8A0C4e1", token: USDC, amount0: false, fee: 10000 },
  { pair: "bUSDT/USDC 1%", address: "0xfD938605b706883216b3CF859C5209B9C6E2Bcd5", token: USDC, amount0: true, fee: 10000 },
  { pair: "bUSDT/USDC 0.3%", address: "0x376D2128728E949d5dbFC4E1780c8a5c6799236C", token: USDC, amount0: true, fee: 3000 },
  { pair: "bBTCB/USDC 1%", address: "0xe5ca3eF671dd895eE86392024acF42f065f4b821", token: USDC, amount0: true, fee: 10000 },
  { pair: "bBTCB/USDC 0.3%", address: "0x7C7B96B200c1C518a615cbF3e956254b3a51F1A4", token: USDC, amount0: true, fee: 3000 },
];

const FEE_SCALE = 1_000_000n;
const abs = (n: bigint) => (n < 0n ? -n : n);

const SWAP_FEES = "Swap Fees";

const adapterFetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const record = (pool: Pool, amount: bigint, fee: bigint) => {
    if (amount <= 0n) return;
    const opts = pool.crossChain ? { skipChain: true } : {};
    dailyVolume.add(pool.token, amount, opts);
    if (fee > 0n) dailyFees.add(pool.token, fee, { ...opts, label: SWAP_FEES });
  };

  const byId: Record<string, (typeof V4_POOLS)[number]> = {};
  for (const pool of V4_POOLS) byId[pool.id.toLowerCase()] = pool;

  const [v4Logs, v3Logs] = await Promise.all([
    options.getLogs({ target: POOL_MANAGER, eventAbi: SWAP_V4 }),
    Promise.all(
      V3_POOLS.map(async (pool) => ({
        pool,
        logs: await options.getLogs({ target: pool.address, eventAbi: SWAP_V3 }),
      }))
    ),
  ]);

  for (const log of v4Logs) {
    const pool = byId[String(log.id).toLowerCase()];
    if (!pool) continue; // every other v4 pool on Arc, which is not ours to count
    const amount = abs(BigInt(pool.amount0 ? log.amount0 : log.amount1));
    record(pool, amount, (amount * BigInt(log.fee)) / FEE_SCALE);
  }

  for (const { pool, logs } of v3Logs)
    for (const log of logs) {
      const amount = abs(BigInt(pool.amount0 ? log.amount0 : log.amount1));
      record(pool, amount, (amount * BigInt(pool.fee)) / FEE_SCALE);
    }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    // The pool fee is the liquidity providers'. Ellipse charges its own 0.5% on swaps
    // routed through its interface, but that is taken by Uniswap's router inside the
    // same transaction and leaves no event of its own, so it is not counted here
    // rather than estimated.
    dailySupplySideRevenue: dailyFees.clone(),
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch: adapterFetch,
  chains: [CHAIN.ARC],
  start: "2026-09-06",
  methodology: {
    Volume: "Swap volume in Ellipse's own markets on Arc: the Uniswap pools it opened for the assets it bridges (bCRCL, bGLD, bBTCB, bUSDT) and the market for its own token. Each swap is counted once, on whichever side has a price - USDC everywhere except the ELLIPSE market, which is counted on its bCRCL side and valued as the CRCL held in custody behind it. Launchpad launches are not counted: those pools are opened for other people's tokens on Uniswap's shared PoolManager, so their volume belongs to that DEX.",
    Fees: "The fee each swap paid to the pool. Two of these pools run Ellipse's market-hours hook and charge 1%, 2% or 3% depending on whether the underlying market is open or shut; for those the rate is read from the swap itself rather than assumed, and the rest are fixed at creation.",
    UserFees: "Same as Fees: what the trader paid on each swap.",
    SupplySideRevenue: "All of it. The pool fee goes to the liquidity providers.",
    Revenue: "None here. Ellipse does charge 0.5% on swaps routed through its own interface, but Uniswap's router takes it inside the same transaction and emits no event for it, so it is left out rather than estimated.",
    ProtocolRevenue: "Same as Revenue.",
  },
  breakdownMethodology: {
    Fees: { [SWAP_FEES]: "Fee paid to the pool on each swap." },
    SupplySideRevenue: { [SWAP_FEES]: "The pool fee, which goes to the liquidity providers." },
  },
};

export default adapter;
