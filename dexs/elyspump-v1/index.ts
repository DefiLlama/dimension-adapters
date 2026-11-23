import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { dedupeLogs, ELYSPUMP_LABEL as LABEL } from "../../helpers/elyspump";

// ElysPump (https://elysp.com) Launchpad v1: every coin's full supply goes into a one-sided Uniswap V3 pool vs WHYPE on
// ElysPump's own V3 factory (0x367f85886af509e364c8190862bc714555fefc3e, not tracked by the uniswap-v3 adapter), with the LP
// position held by the launchpad forever. The 1% pool fee is split 50/50 creator / platform by collectFees(token).
// Docs: https://docs.elysp.com/ ("Launchpad v1", "Deployed contracts", "Interfaces").
const LAUNCHPAD = "0x5afe876a625a6fe230dd361b9a5bef8e9bea6fe3";
const DEPLOY_BLOCK = 36; // first Launched log, 2026-10-20
const WHYPE = "0xba876237b0f021a6c6d852d6c26e107997cc5e81"; // quote side of every v1 pool

// The bool is unnamed in the published interface, so each pool's WHYPE side is derived from the token addresses instead.
const LAUNCHED = "event Launched(address indexed token, address indexed pool, address indexed creator, string name, string symbol, string logo, bool flag, uint256 devBuy)";
const FEE = "uint24:FEE"; // the v1 pool fee tier in 1e-6 units (10000 = 1%)
const V3_SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const V3_MINT = "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)";
// Anyone can add liquidity to a v1 pool (most have none besides the launchpad's); fees earned by those positions go to them.
const TO_LPS = "Swap Fees To Third-Party LPs";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const launches = await options.getLogs({ target: LAUNCHPAD, eventAbi: LAUNCHED, fromBlock: DEPLOY_BLOCK, cacheInCloud: true });
  const whypeIs0: Record<string, boolean> = {};
  for (const l of launches) whypeIs0[String(l.pool).toLowerCase()] = WHYPE < String(l.token).toLowerCase(); // V3 sorts token0 < token1
  const pools = Object.keys(whypeIs0);

  // The launchpad's own position in each pool: minted once at launch and never removable
  const mints = pools.length ? await options.getLogs({ targets: pools, eventAbi: V3_MINT, fromBlock: DEPLOY_BLOCK, cacheInCloud: true, onlyArgs: false }) : [];
  const position: Record<string, { liquidity: bigint, tickLower: number, tickUpper: number }> = {};
  for (const m of mints) {
    if (String(m.args.owner).toLowerCase() !== LAUNCHPAD) continue;
    const pool = String(m.address).toLowerCase();
    if (position[pool]) throw new Error(`ElysPump v1: more than one launchpad position in pool ${pool}`);
    position[pool] = { liquidity: BigInt(m.args.amount), tickLower: Number(m.args.tickLower), tickUpper: Number(m.args.tickUpper) };
  }

  // V3 Swap amounts are the pool's side, gross of the LP fee on the input. The fee is taken from the input token: WHYPE on a buy
  // (exact), the coin on a sell, valued here at that trade's own execution price (WHYPE out * fee / (1 - fee)).
  const feePpm = BigInt(await options.api.call({ target: LAUNCHPAD, abi: FEE }));
  const swaps = pools.length ? dedupeLogs(await options.getLogs({ targets: pools, eventAbi: V3_SWAP, onlyArgs: false })) : [];
  // The fee is shared pro rata by the liquidity active at the swap: the launchpad's part is its position's liquidity over the
  // pool's active liquidity (logged after the swap), or 0 when the price is outside its range. In pools with only the launchpad's
  // position this is exactly 1; where third parties added liquidity it is approximate for swaps that cross their ranges.
  for (const s of swaps) {
    const pool = String(s.address).toLowerCase();
    if (!position[pool]) throw new Error(`ElysPump v1: no launchpad position found in pool ${pool}`);
    const { liquidity: launchpadLiquidity, tickLower, tickUpper } = position[pool];
    const amount = BigInt(whypeIs0[pool] ? s.args.amount0 : s.args.amount1);
    const fee = amount > 0n ? amount * feePpm / 1_000_000n : -amount * feePpm / (1_000_000n - feePpm);
    const tick = Number(s.args.tick);
    const activeLiquidity = BigInt(s.args.liquidity);
    const inRange = tick >= tickLower && tick < tickUpper;
    const toLaunchpad = !inRange ? 0n : activeLiquidity <= launchpadLiquidity ? fee : fee * launchpadLiquidity / activeLiquidity;
    const toCreator = toLaunchpad / 2n; // collectFees(token) splits the launchpad's LP fees 50/50 creator / platform (docs, "Launchpad v1")
    dailyVolume.add(WHYPE, amount > 0n ? amount : -amount + fee);
    dailyFees.add(WHYPE, fee, LABEL.swapFees);
    dailySupplySideRevenue.add(WHYPE, toCreator, LABEL.toCreators);
    dailySupplySideRevenue.add(WHYPE, fee - toLaunchpad, TO_LPS);
    dailyRevenue.add(WHYPE, toLaunchpad - toCreator, LABEL.toPlatform);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
}

const methodology = {
  Volume: "Value of all trades in ElysPump v1 launch pools, measured in WHYPE before the trading fee.",
  Fees: "The 1% pool fee paid by traders on every ElysPump v1 launch-pool trade.",
  UserFees: "The 1% pool fee paid by traders on every ElysPump v1 launch-pool trade.",
  Revenue: "The platform's 50% of the pool fees earned by the launchpad's own liquidity.",
  ProtocolRevenue: "The platform's 50% of the pool fees earned by the launchpad's own liquidity, sent to the ElysPump platform fee address.",
  SupplySideRevenue: "The coin creator's 50% of the pool fees earned by the launchpad's own liquidity, plus the fees earned by liquidity other users added to the pools.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "1% Uniswap V3 pool fee on every trade, paid in WHYPE on buys and in the coin on sells (valued at the trade's price).",
  },
  UserFees: {
    [LABEL.swapFees]: "1% Uniswap V3 pool fee paid by traders on every trade.",
  },
  Revenue: {
    [LABEL.toPlatform]: "50% of the pool fees earned by the launchpad's position, to the platform.",
  },
  ProtocolRevenue: {
    [LABEL.toPlatform]: "50% of the pool fees earned by the launchpad's position, paid to the ElysPump platform fee address.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "50% of the pool fees earned by the launchpad's position, paid to the coin's creator.",
    [TO_LPS]: "Pool fees earned by liquidity that other users added to a v1 pool (share of active liquidity at each swap).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-21",
  methodology,
  breakdownMethodology,
};

export default adapter;
