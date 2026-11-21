import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CircleWarp (circlewarp.fun, "Warp") - USDC-native bonding-curve launchpad on Arc. No
// published docs page; a full technical write-up (contracts, events, fee splits) is
// embedded as markdown inside the site's own JS bundle, meant for integrators/bots.
// Every address and number below was independently re-verified on-chain rather than
// trusted at face value (see comments per constant).
//
// Each launched token gets its own BondingCurve contract (unlike Sashimi's single
// shared engine) - curves are discovered via the factory's TokenCreated event.
const LAUNCH_FACTORY = "0x0dCad158e98bC24455f9e94F46709d8a5F6D1255";
// CircleWarp was live before Arc's 2026-09-16 public mainnet launch; only counting
// from public launch, so the deploy block below is that boundary, not the real deploy.
const LAUNCH_FACTORY_DEPLOY_BLOCK = 21068653;
const WARPDEX_FACTORY = "0x32330C2400a6e0830D56661169eBB6C147E3577a";
const WARPDEX_FACTORY_DEPLOY_BLOCK = 21068653;

const TOKEN_CREATED_EVENT =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, string metadataURI)";
// Curve buys/sells settle in Arc's native 18-decimal USDC (msg.value), not the
// 6-decimal ERC-20 facade - booked via addGasToken below.
const TRADE_EVENT =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 usdcGross, uint256 tokenAmount, uint256 priceX18, uint256 marketCap)";
// Non-standard PairCreated (adds a `creator` field vs vanilla Uniswap V2); topic0
// independently hashed and confirmed, not just taken from the embedded doc's claim.
const PAIR_CREATED_EVENT =
  "event PairCreated(address indexed token0, address indexed token1, address pair, address creator, uint256)";
const SWAP_EVENT =
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)";

const BPS = 10000n;

// Curve mode: flat 1% fee, 50/50 creator/protocol. Verified on a solo-transaction-block
// trade (gross 0.4832660937865872 USDC): the curve's own accruedCreatorFees()
// accumulator moved by exactly 0.5% of that gross, to the wei.
const CURVE_FEE_BPS = 100n;

// Post-graduation: liquidity moves into a WarpDex pool (CircleWarp's own Uniswap V2
// fork). 1% swap fee, split 40% LP (compounds into reserves - the LP token itself is
// burned at migration, so this never pays out to a holder) / 30% creator / 30%
// protocol. Verified the same way: a solo-transaction-block swap moved both
// creatorFee0() and protocolFee0() by exactly 0.3% of the input each, to the unit.
const POOL_LP_BPS = 40n;
const POOL_CREATOR_BPS = 30n;
const POOL_PROTOCOL_BPS = 30n;

const CURVE_TRADING_FEES = "Curve Trading Fees";
const CURVE_FEES_TO_PROTOCOL = "Curve Trading Fees to Protocol";
const CURVE_FEES_TO_CREATORS = "Curve Trading Fees to Creators";
const POOL_SWAP_FEES = "Graduated Pool Swap Fees";
const POOL_FEES_TO_PROTOCOL = "Graduated Pool Swap Fees to Protocol";
const POOL_FEES_TO_CREATORS = "Graduated Pool Swap Fees to Creators";
const POOL_FEES_TO_LPS = "Graduated Pool Swap Fees to LPs";

async function fetchCurve(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const launches = await options.getLogs({
    target: LAUNCH_FACTORY,
    eventAbi: TOKEN_CREATED_EVENT,
    fromBlock: LAUNCH_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const curves = launches.map((log: any) => log.curve);
  if (!curves.length) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  const trades = await options.getLogs({ targets: curves, eventAbi: TRADE_EVENT });
  for (const log of trades) {
    const gross = BigInt(log.usdcGross);
    const totalFee = (gross * CURVE_FEE_BPS) / BPS;
    const creatorFee = totalFee / 2n;
    const protocolFee = totalFee - creatorFee;
    dailyFees.addGasToken(totalFee, CURVE_TRADING_FEES);
    dailyRevenue.addGasToken(protocolFee, CURVE_FEES_TO_PROTOCOL);
    dailySupplySideRevenue.addGasToken(creatorFee, CURVE_FEES_TO_CREATORS);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

async function fetchGraduatedPool(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const pairsCreated = await options.getLogs({
    target: WARPDEX_FACTORY,
    eventAbi: PAIR_CREATED_EVENT,
    fromBlock: WARPDEX_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  if (!pairsCreated.length) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  const pairs = pairsCreated.map((log: any) => log.pair);
  const pairTokens = new Map<string, [string, string]>(
    pairsCreated.map((log: any) => [log.pair.toLowerCase(), [log.token0, log.token1]]),
  );

  const swapLogsByPair = await options.getLogs({ targets: pairs, eventAbi: SWAP_EVENT, flatten: false });
  swapLogsByPair.forEach((logs: any[], i: number) => {
    const [token0, token1] = pairTokens.get(pairs[i].toLowerCase())!;
    for (const log of logs) {
      const amount0In = BigInt(log.amount0In);
      const amount1In = BigInt(log.amount1In);
      const [feeToken, amountIn] = amount0In > 0n ? [token0, amount0In] : [token1, amount1In];
      if (amountIn === 0n) continue;
      const totalFee = (amountIn * (POOL_LP_BPS + POOL_CREATOR_BPS + POOL_PROTOCOL_BPS)) / BPS;
      const lpFee = (amountIn * POOL_LP_BPS) / BPS;
      const creatorFee = (amountIn * POOL_CREATOR_BPS) / BPS;
      const protocolFee = totalFee - lpFee - creatorFee;
      dailyFees.add(feeToken, totalFee, POOL_SWAP_FEES);
      dailyRevenue.add(feeToken, protocolFee, POOL_FEES_TO_PROTOCOL);
      dailySupplySideRevenue.add(feeToken, creatorFee, POOL_FEES_TO_CREATORS);
      dailySupplySideRevenue.add(feeToken, lpFee, POOL_FEES_TO_LPS);
    }
  });

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const fetch = async (options: FetchOptions) => {
  const [curve, pool] = await Promise.all([fetchCurve(options), fetchGraduatedPool(options)]);

  const dailyFees = curve.dailyFees;
  dailyFees.addBalances(pool.dailyFees);
  const dailyRevenue = curve.dailyRevenue;
  dailyRevenue.addBalances(pool.dailyRevenue);
  const dailySupplySideRevenue = curve.dailySupplySideRevenue;
  dailySupplySideRevenue.addBalances(pool.dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Curve mode: flat 1% fee on every bonding-curve buy/sell, read from each trade's own gross USDC amount. Post-graduation: 1% swap fee on CircleWarp's own WarpDex pools (a custom Uniswap V2 fork), taken from whichever side of the swap is the input token. Token creation itself is free (no launch fee).",
  Revenue: "Curve mode: 50% of the curve trading fee. Post-graduation: 30% of the WarpDex pool swap fee.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "Curve mode: 50% of the curve trading fee, paid to the token's creator. Post-graduation: 30% of the pool swap fee to the creator, plus the 40% LP share that stays in the pool as reserve growth (the LP position itself is burned at graduation, so this permanently compounds into the pool rather than paying out to a live LP holder).",
};

const breakdownMethodology = {
  Fees: {
    [CURVE_TRADING_FEES]: "1% of the gross native-USDC value of every bonding-curve buy and sell, read from the Trade event's usdcGross field.",
    [POOL_SWAP_FEES]: "1% of the input-side token amount on every swap of a graduated token's WarpDex pool.",
  },
  Revenue: {
    [CURVE_FEES_TO_PROTOCOL]: "50% of the curve trading fee.",
    [POOL_FEES_TO_PROTOCOL]: "30% of the graduated-pool swap fee.",
  },
  ProtocolRevenue: {
    [CURVE_FEES_TO_PROTOCOL]: "50% of the curve trading fee.",
    [POOL_FEES_TO_PROTOCOL]: "30% of the graduated-pool swap fee.",
  },
  SupplySideRevenue: {
    [CURVE_FEES_TO_CREATORS]: "50% of the curve trading fee, paid to the token's creator.",
    [POOL_FEES_TO_CREATORS]: "30% of the graduated-pool swap fee, paid to the token's creator.",
    [POOL_FEES_TO_LPS]: "40% of the graduated-pool swap fee, retained in the pool as reserve growth (the pool's LP token is burned at graduation).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
