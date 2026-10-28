import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// LIFT (https://lift.fun) v2: every launch mints a fixed-supply token into one
// single-sided Uniswap V4 position that is locked forever, in a pool whose LP fee
// is 0 and whose hook (LaunchHook) takes every fee in USDC on each swap.
// https://arc-scan.org/address/0x1ca37B3C40e89aaD48b5ad3352269c2293CFD3DA
const FACTORY = "0x1ca37B3C40e89aaD48b5ad3352269c2293CFD3DA";
// the hook's factory is set once and is the factory above
// https://arc-scan.org/address/0xca55CDde6578F6f8113dd339520E13418Abc2acC
const LAUNCH_HOOK = "0xca55CDde6578F6f8113dd339520E13418Abc2acC";

// launch() requires msg.value == launchFeeWei; the fee is paid in Arc's native USDC,
// whose native view has 18 decimals while the ERC-20 has 6
const USDC = ADDRESSES.arc.USDC;
const NATIVE_TO_ERC20_USDC = 10n ** 12n;
const BPS = 10_000n;
const BASE_TO_CREATOR = 0; // LaunchHook.BaseDestination.Creator

const TOKEN_LAUNCHED_EVENT = "event TokenLaunchedV4(address indexed token, address indexed creator, bytes32 indexed poolId, address quote, uint256 positionId, uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 initialBuyE6, string name, string symbol, string metadataURI)";
const LAUNCH_FEE_UPDATED_EVENT = "event LaunchFeeUpdated(uint256 launchFeeWei)";
const CREATOR_BASE_ROUTED_EVENT = "event CreatorBaseRouted(bytes32 indexed poolId, address indexed creator, uint8 destination)";
const FEE_ACCRUED_EVENT = "event FeeAccrued(bytes32 indexed poolId, address currency, uint256 base, uint256 tax, uint256 basePot, uint256 taxPot)";
const GET_POOL_ABI = "function getPool(bytes32 poolId) view returns ((bool registered, address token, address quote, address creator, uint16 protocolFeeBps, uint16 creatorTaxBuyBps, uint16 creatorTaxSellBps, uint8 creatorBaseTo, uint8 snipeExemptCount, (uint16 creatorBps, uint16 burnBps, uint16 dividendBps, uint16 liquidityBps) split, uint16 snipeStartBps, uint64 windowBlocks, uint64 launchBlock, uint64 launchTime, uint256 minHolderBalance, address distributor, int24 tickLower, int24 tickUpper, uint128 pendingLiquidity, uint128 pendingBurn, uint128 base, uint128 tax, uint64 settledAt, uint64 compoundedAt))";

const LABELS = {
  CreatorSwapFees: "Creator Swap Fees",
  LaunchFees: "Token Launch Fees",
  SwapFeesToTreasury: "Swap Fees To Treasury",
  LaunchFeesToTreasury: "Launch Fees To Treasury",
  SwapFeesToCreators: "Swap Fees To Creators",
  SwapFeesToBuybackAndBurn: "Swap Fees To Launched Token Buyback And Burn",
  SwapFeesToHolders: "Swap Fees To Launched Token Holders",
  SwapFeesToLiquidity: "Swap Fees To Locked Liquidity",
};

// LaunchHook.BaseDestination and FeeSplit share this bucket order
const BUCKET_LABELS = [
  LABELS.SwapFeesToCreators,
  LABELS.SwapFeesToBuybackAndBurn,
  LABELS.SwapFeesToHolders,
  LABELS.SwapFeesToLiquidity,
];

const isBefore = (a: any, b: any) =>
  Number(a.blockNumber) < Number(b.blockNumber) ||
  (Number(a.blockNumber) === Number(b.blockNumber) && Number(a.logIndex ?? a.index) < Number(b.logIndex ?? b.index));

// LaunchHook._allocate: floor each bucket, rounding dust goes to the first weighted bucket
const allocate = (amount: bigint, bps: bigint[]) => {
  const parts = bps.map((b) => (amount * b) / BPS);
  const dust = amount - parts.reduce((a, b) => a + b, 0n);
  const first = bps.findIndex((b) => b > 0n);
  if (dust > 0n && first >= 0) parts[first] += dust;
  return parts;
};

// fee of every launch in the window: launchFeeWei at the window start, replayed through the
// window's LaunchFeeUpdated logs (a factory deployed inside the window emits one from its constructor)
async function getLaunchFees(options: FetchOptions): Promise<bigint> {
  const launches = await options.getLogs({ target: FACTORY, eventAbi: TOKEN_LAUNCHED_EVENT, onlyArgs: false });
  if (!launches.length) return 0n;

  const updates = (await options.getLogs({ target: FACTORY, eventAbi: LAUNCH_FEE_UPDATED_EVENT, onlyArgs: false })).sort((a: any, b: any) => (isBefore(a, b) ? -1 : 1));
  const openingFee = await options.fromApi.call({ target: FACTORY, abi: "uint256:launchFeeWei", permitFailure: true });

  let total = 0n;
  for (const launch of launches) {
    let fee = openingFee === null || openingFee === undefined ? undefined : BigInt(openingFee);
    for (const update of updates) {
      if (isBefore(update, launch)) fee = BigInt(update.args.launchFeeWei);
    }
    if (fee === undefined) throw new Error(`no launch fee in force for launch at block ${launch.blockNumber}`);
    total += fee;
  }
  return total / NATIVE_TO_ERC20_USDC;
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // one FeeAccrued per swap: base = base fee plus any anti-snipe surcharge, tax = creator fee
  const accruals = await options.getLogs({ target: LAUNCH_HOOK, eventAbi: FEE_ACCRUED_EVENT, onlyArgs: false });
  if (accruals.length) {
    // a pool's economics are fixed at registration; the only change allowed later is one
    // routeCreatorBase away from Creator, replayed below from the window's CreatorBaseRouted logs
    const poolIds = [...new Set(accruals.map((a: any) => a.args.poolId.toLowerCase()))];
    const configs = await options.toApi.multiCall({ target: LAUNCH_HOOK, abi: GET_POOL_ABI, calls: poolIds });
    const routes = await options.getLogs({ target: LAUNCH_HOOK, eventAbi: CREATOR_BASE_ROUTED_EVENT, onlyArgs: false });
    const pools: Record<string, any> = {};
    poolIds.forEach((id, i) => { pools[id] = configs[i]; });

    for (const accrual of accruals) {
      const { poolId, currency, base, tax } = accrual.args;
      const id = poolId.toLowerCase();
      const pool = pools[id];
      if (!pool?.registered) throw new Error(`FeeAccrued for unregistered pool ${poolId}`);

      const route = routes.find((r: any) => r.args.poolId.toLowerCase() === id);
      const baseDestination = route && isBefore(accrual, route) ? BASE_TO_CREATOR : Number(pool.creatorBaseTo);

      const baseFee = BigInt(base);
      const creatorFee = BigInt(tax);
      const toTreasury = (baseFee * BigInt(pool.protocolFeeBps)) / BPS;
      const { creatorBps, burnBps, dividendBps, liquidityBps } = pool.split;
      const buckets = allocate(creatorFee, [creatorBps, burnBps, dividendBps, liquidityBps].map(BigInt));
      buckets[baseDestination] += baseFee - toTreasury;

      dailyFees.add(currency, baseFee, METRIC.SWAP_FEES);
      dailyFees.add(currency, creatorFee, LABELS.CreatorSwapFees);
      dailyRevenue.add(currency, toTreasury, LABELS.SwapFeesToTreasury);
      buckets.forEach((amount, i) => dailySupplySideRevenue.add(currency, amount, BUCKET_LABELS[i]));
    }
  }

  const launchFees = await getLaunchFees(options);
  dailyFees.add(USDC, launchFees, LABELS.LaunchFees);
  dailyRevenue.add(USDC, launchFees, LABELS.LaunchFeesToTreasury);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
}

const methodology = {
  Fees: "Fees the LIFT v2 hook takes in the pool's quote asset (USDC or EURC) on every swap of a LIFT v2 token: the base fee, including the anti-snipe surcharge in a launch's first blocks, plus the fee each creator sets for buys and sells. Counted when the swap happens, plus the flat fee paid for every token launch.",
  UserFees: "Swap fees paid by traders of LIFT v2 tokens and launch fees paid by token deployers.",
  Revenue: "The LIFT treasury share of the base fee plus all launch fees. LIFT takes no share of the creator swap fee.",
  ProtocolRevenue: "The LIFT treasury share of the base fee plus all launch fees. LIFT takes no share of the creator swap fee.",
  SupplySideRevenue: "Everything else goes to the creator side of each launch: the rest of the base fee and the whole creator swap fee, split by the launch's fixed settings between the creator, buyback and burn of the launched token, dividends to holders of the launched token, and liquidity added to the launch's locked pool.",
  HoldersRevenue: "No fees are distributed to holders of a protocol token.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Base fee of every swap (1% of the traded quote amount), plus the anti-snipe surcharge paid by buys in a launch's first blocks.",
    [LABELS.CreatorSwapFees]: "Extra fee each creator sets for buys and sells of their token (up to 10% per side). The hook takes it in the quote asset from the swap itself, next to the base fee; it is not a transfer tax on the token.",
    [LABELS.LaunchFees]: "Flat fee paid on every token launch (currently 1 USDC), as set on the factory at the time of the launch.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Base fee and anti-snipe surcharge paid by traders.",
    [LABELS.CreatorSwapFees]: "Creator-set swap fee paid by traders.",
    [LABELS.LaunchFees]: "Flat fee paid by token deployers on every launch.",
  },
  Revenue: {
    [LABELS.SwapFeesToTreasury]: "Treasury share of the base fee, fixed per pool at launch (30% for every pool so far).",
    [LABELS.LaunchFeesToTreasury]: "All launch fees, swept from the factory to the treasury.",
  },
  ProtocolRevenue: {
    [LABELS.SwapFeesToTreasury]: "Treasury share of the base fee, fixed per pool at launch (30% for every pool so far).",
    [LABELS.LaunchFeesToTreasury]: "All launch fees, swept from the factory to the treasury.",
  },
  SupplySideRevenue: {
    [LABELS.SwapFeesToCreators]: "Rest of the base fee unless the creator routed it elsewhere, plus the creator's bucket of the creator swap fee. The base-fee destination is taken as it stood at swap time; a creator who reroutes it later also moves fees accrued but not yet settled, which this split does not follow.",
    [LABELS.SwapFeesToBuybackAndBurn]: "Base-fee share and creator swap fee assigned to burning the launched token; the hook buys the launched token with it and sends it to the dead address.",
    [LABELS.SwapFeesToHolders]: "Base-fee share and creator swap fee assigned to dividends, paid in the quote asset to holders of the launched token.",
    [LABELS.SwapFeesToLiquidity]: "Base-fee share and creator swap fee assigned to liquidity, added permanently to the launch's locked pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-15",
  methodology,
  breakdownMethodology,
};

export default adapter;
