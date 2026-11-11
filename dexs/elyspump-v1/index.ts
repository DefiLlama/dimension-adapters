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

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const launches = await options.getLogs({ target: LAUNCHPAD, eventAbi: LAUNCHED, fromBlock: DEPLOY_BLOCK, cacheInCloud: true });
  const whypeIs0: Record<string, boolean> = {};
  for (const l of launches) whypeIs0[String(l.pool).toLowerCase()] = WHYPE < String(l.token).toLowerCase(); // V3 sorts token0 < token1
  const pools = Object.keys(whypeIs0);

  // V3 Swap amounts are the pool's side, gross of the LP fee on the input. The fee is taken from the input token: WHYPE on a buy
  // (exact), the coin on a sell, valued here at that trade's own execution price (WHYPE out * fee / (1 - fee)).
  const feePpm = BigInt(await options.api.call({ target: LAUNCHPAD, abi: FEE }));
  const swaps = pools.length ? dedupeLogs(await options.getLogs({ targets: pools, eventAbi: V3_SWAP, onlyArgs: false })) : [];
  for (const s of swaps) {
    const amount = BigInt(whypeIs0[String(s.address).toLowerCase()] ? s.args.amount0 : s.args.amount1);
    const fee = amount > 0n ? amount * feePpm / 1_000_000n : -amount * feePpm / (1_000_000n - feePpm);
    const toCreator = fee / 2n; // collectFees(token) splits the pool's LP fees 50/50 creator / platform (docs, "Launchpad v1")
    dailyVolume.add(WHYPE, amount > 0n ? amount : -amount + fee);
    dailyFees.add(WHYPE, fee, LABEL.swapFees);
    dailySupplySideRevenue.add(WHYPE, toCreator, LABEL.toCreators);
    dailyRevenue.add(WHYPE, fee - toCreator, LABEL.toPlatform);
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
  Revenue: "The platform's 50% of the pool fee.",
  ProtocolRevenue: "The platform's 50% of the pool fee, sent to the ElysPump platform fee address.",
  SupplySideRevenue: "The coin creator's 50% of the pool fee.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "1% Uniswap V3 pool fee on every trade, paid in WHYPE on buys and in the coin on sells (valued at the trade's price).",
  },
  UserFees: {
    [LABEL.swapFees]: "1% Uniswap V3 pool fee paid by traders on every trade.",
  },
  Revenue: {
    [LABEL.toPlatform]: "50% of the pool fee, to the platform.",
  },
  ProtocolRevenue: {
    [LABEL.toPlatform]: "50% of the pool fee, paid to the ElysPump platform fee address.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "50% of the pool fee, paid to the coin's creator.",
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
