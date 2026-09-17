import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Tsunami is the bonding-curve launchpad on Ink: https://tsunami.trade
const FACTORY = "0x5934a5C377309453746EE8aa5194F671930c09fa";

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

// Graduated curves seed a pool on Calamari's v4 deployment, where Tsunami's
// hook keeps charging its own fee on every swap
const POOL_MANAGER = "0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560";
const POOL_MANAGER_DEPLOY_BLOCK = 54652108;

const tokenBoughtEvent =
  "event TokenBought(uint256 indexed amount, address indexed buyer, uint256 amountOut, uint256 timestamp, (uint256 realBaseReserves, uint256 realQuoteReserves, uint256 virtualBaseReserves, uint256 virtualQuoteReserves) curve)";
const tokenSoldEvent =
  "event TokenSold(uint256 indexed amount, address indexed seller, uint256 amountOut, uint256 timestamp, (uint256 realBaseReserves, uint256 realQuoteReserves, uint256 virtualBaseReserves, uint256 virtualQuoteReserves) curve)";
const swapFeeAccruedEvents = [
  "event SwapFeeAccrued(address indexed currency, address indexed curve, uint256 amount)",
  "event SwapFeeAccrued(address indexed currency, uint256 amount)",
];
const initializeEvent =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";
const swapEvent =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";

const launchedTokensAbi = "function getLaunchedTokens() view returns (address[])";
const tokenCurvesAbi = "function tokenCurves(address) view returns (address)";
const tokenQuotesAbi = "function tokenQuotes(address) view returns (address)";
const tokenHooksAbi = "function tokenHooks(address) view returns (address)";
const curveFeeConfigAbi =
  "function feeConfig(address curve) view returns (uint256 feeBps, address recipient, uint256 feeSharePercent, address feeShare)";

const BPS_DENOMINATOR = 10_000n;
const abs = (v: bigint) => (v < 0n ? -v : v);
const PERCENT_DENOMINATOR = 100n;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const tokens: string[] = await options.api.call({ target: FACTORY, abi: launchedTokensAbi });
  if (!tokens.length)
    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const [curveOf, quoteOfToken, hookOfToken] = await Promise.all([
    options.api.multiCall({ target: FACTORY, abi: tokenCurvesAbi, calls: tokens }),
    options.api.multiCall({ target: FACTORY, abi: tokenQuotesAbi, calls: tokens }),
    options.api.multiCall({ target: FACTORY, abi: tokenHooksAbi, calls: tokens }),
  ]);
  const feeConfigs = await options.api.multiCall({
    target: FACTORY,
    abi: curveFeeConfigAbi,
    calls: curveOf,
  });

  const quoteOf: Record<string, string> = {};
  const feeOf: Record<string, { rate: bigint; creatorShare: bigint }> = {};
  const hookSet = new Set<string>();
  curveOf.forEach((curve: string, i: number) => {
    if (!curve || curve === NULL_ADDRESS) return;
    const key = curve.toLowerCase();
    quoteOf[key] = quoteOfToken[i];
    const config = feeConfigs[i];
    const hasShare = config && String(config.feeShare) !== NULL_ADDRESS;
    feeOf[key] = {
      rate: BigInt(config?.feeBps ?? 0),
      creatorShare: hasShare ? BigInt(config.feeSharePercent) : 0n,
    };
    const hook = String(hookOfToken[i] ?? NULL_ADDRESS);
    if (hook !== NULL_ADDRESS) hookSet.add(hook.toLowerCase());
  });

  const quoteTokens = new Set(Object.values(quoteOf).map((t) => t.toLowerCase()));
  const curves = Object.keys(quoteOf);
  if (!curves.length)
    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const [buys, sells] = await Promise.all([
    options.getLogs({ targets: curves, eventAbi: tokenBoughtEvent, onlyArgs: false }),
    options.getLogs({ targets: curves, eventAbi: tokenSoldEvent, onlyArgs: false }),
  ]);

  const book = (curve: string, gross: bigint, fee: bigint) => {
    const key = curve.toLowerCase();
    const quote = quoteOf[key];
    if (!quote) return;
    dailyVolume.add(quote, gross);
    dailyFees.add(quote, fee, "Launch Trading Fees");

    const creatorFee = (fee * (feeOf[key]?.creatorShare ?? 0n)) / PERCENT_DENOMINATOR;
    dailyRevenue.add(quote, fee - creatorFee, "Launch Trading Fees To Treasury");
    dailySupplySideRevenue.add(quote, creatorFee, "Launch Trading Fees To Creators");
  };

  buys.forEach((log: any) => {
    // a buy emits the gross quote spent, with the fee taken out of it
    const rate = feeOf[String(log.address).toLowerCase()]?.rate ?? 0n;
    const gross = BigInt(log.args.amount);
    book(log.address, gross, (gross * rate) / BPS_DENOMINATOR);
  });

  sells.forEach((log: any) => {
    // a sell emits the quote paid out net of the fee, so the gross is walked back
    const rate = feeOf[String(log.address).toLowerCase()]?.rate ?? 0n;
    const net = BigInt(log.args.amountOut);
    const gross = (net * BPS_DENOMINATOR) / (BPS_DENOMINATOR - rate);
    book(log.address, gross, gross - net);
  });

  const initLogs = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: initializeEvent,
    fromBlock: POOL_MANAGER_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const graduatedPools: Record<string, [string, string]> = {};
  initLogs.forEach((log: any) => {
    if (!hookSet.has(String(log.hooks).toLowerCase())) return;
    graduatedPools[String(log.id).toLowerCase()] = [log.currency0, log.currency1];
  });

  const poolSwaps = await options.getLogs({ target: POOL_MANAGER, eventAbi: swapEvent });
  poolSwaps.forEach((log: any) => {
    const pool = graduatedPools[String(log.id).toLowerCase()];
    if (!pool) return;

    // the hook takes its fee in the pool's quote asset, which is the side the
    // curve raised in and the only side with a reliable price
    const amount0 = BigInt(log.amount0);
    const amount1 = BigInt(log.amount1);
    const quoteIsCurrency0 = quoteTokens.has(pool[0].toLowerCase());
    if (!quoteIsCurrency0 && !quoteTokens.has(pool[1].toLowerCase())) return;

    dailyVolume.add(
      quoteIsCurrency0 ? pool[0] : pool[1],
      abs(quoteIsCurrency0 ? amount0 : amount1)
    );
  });

  const hooks = Array.from(hookSet);
  const hookFees = hooks.length
    ? (await Promise.all(
        swapFeeAccruedEvents.map((eventAbi) => options.getLogs({ targets: hooks, eventAbi })),
      )).flat()
    : [];
  hookFees.forEach((log: any) => {
    const amount = BigInt(log.amount);
    dailyFees.add(log.currency, amount, "Graduated Pool Swap Fees");

    const curve = log.curve ? String(log.curve).toLowerCase() : undefined;
    const share = curve ? feeOf[curve]?.creatorShare ?? 0n : 0n;
    const creatorFee = (amount * share) / PERCENT_DENOMINATOR;

    dailyRevenue.add(log.currency, amount - creatorFee, "Graduated Pool Swap Fees To Treasury");
    if (creatorFee > 0n) {
      dailySupplySideRevenue.add(log.currency, creatorFee, "Graduated Pool Swap Fees To Creators");
    }
  });

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
  Volume: "Quote currency traded against the bonding curve of every token launched through the Tsunami factory, plus the quote leg of swaps in the Calamari v4 pools that graduated curves seed. The graduated pools sit on Calamari's PoolManager, so that part of the volume is also counted there and this adapter is marked as double counted.",
  Fees: "The factory's trading fee on every bonding curve buy and sell, plus the swap fee Tsunami's hook charges on pools seeded by graduated curves. Both rates are read from the contracts rather than assumed.",
  UserFees: "Traders pay the curve fee on the bonding curve and the hook fee once the token has graduated.",
  Revenue: "The share of both fees that goes to the Tsunami fee wallet — 70% of each, with the rest going to the launch's creator wherever one is configured.",
  ProtocolRevenue: "All of the above: no token receives a share of Tsunami's fees.",
  SupplySideRevenue: "The creator's percentage of either fee, read per curve from the factory's feeConfig and routed to that launch's FeeShare contract. 30% of the fee today.",
};

const breakdownMethodology = {
  Fees: {
    "Launch Trading Fees": "Fee charged on bonding curve buys and sells.",
    "Graduated Pool Swap Fees": "Fee Tsunami's v4 hook charges on swaps in graduated pools.",
  },
  UserFees: {
    "Launch Trading Fees": "Fee charged on bonding curve buys and sells.",
    "Graduated Pool Swap Fees": "Fee Tsunami's v4 hook charges on swaps in graduated pools.",
  },
  Revenue: {
    "Launch Trading Fees To Treasury": "Curve fees kept by the Tsunami fee wallet.",
    "Graduated Pool Swap Fees To Treasury": "Hook fees kept by the Tsunami fee wallet.",
  },
  SupplySideRevenue: {
    "Launch Trading Fees To Creators": "Curve fees routed to a launch's FeeShare contract.",
    "Graduated Pool Swap Fees To Creators": "Hook fees routed to a launch's FeeShare contract.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // graduated pools live on Calamari's PoolManager, whose own adapter counts
  // the same swaps
  doublecounted: true,
  fetch,
  chains: [CHAIN.INK],
  start: "2026-08-29",
  methodology,
  breakdownMethodology,
};

export default adapter;
