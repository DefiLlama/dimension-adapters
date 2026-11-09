import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// LIFT (https://lift.fun) v1: every launch mints a fixed-supply token into one
// single-sided Uniswap V3 1% position that is locked forever. The position's
// LP fees are collected by the generation's FeeLocker (harvest() is permissionless)
// and split between the token creator and the LIFT treasury.
const GENERATIONS = [
  // first generation, no longer launches; its positions still trade and earn
  { factory: "0x81daBcDbDca5a58B89967F28A3e6bD1677ca159c", feeLocker: "0xE035028F5Df815Bd9dd40777600D9941DE6Db870" },
  { factory: "0x3f29dD25D1F6ad3D09d1d4A880F8a869E3039153", feeLocker: "0x98015DDa2B8810ab67903C726a0E424D6D51b1a9" },
];

// launch() requires msg.value == launchFeeWei; the fee is paid in Arc's native USDC,
// whose native view has 18 decimals while the ERC-20 has 6
const USDC = ADDRESSES.arc.USDC;
const NATIVE_TO_ERC20_USDC = 10n ** 12n;

const TOKEN_LAUNCHED_EVENT = "event TokenLaunched(address indexed token, address indexed creator, address indexed pool, address quote, uint256 positionId, uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 initialBuyE6, string name, string symbol, string metadataURI)";
const LAUNCH_FEE_UPDATED_EVENT = "event LaunchFeeUpdated(uint256 launchFeeWei)";
const FEES_HARVESTED_EVENT = "event FeesHarvested(uint256 indexed positionId, address indexed token, uint256 quoteToCreator, uint256 quoteToTreasury, uint256 baseBurned)";
const GET_POSITION_ABI = "function getPosition(uint256 positionId) view returns ((address token, address pool, address creator, uint16 creatorFeeBps, bool registered, address quote))";

const LABELS = {
  SwapFeesToCreators: "Swap Fees To Creators",
  SwapFeesToTreasury: "Swap Fees To Treasury",
  LaunchFees: "Token Launch Fees",
  LaunchFeesToTreasury: "Launch Fees To Treasury",
};

const isBefore = (a: any, b: any) =>
  Number(a.blockNumber) < Number(b.blockNumber) ||
  (Number(a.blockNumber) === Number(b.blockNumber) && Number(a.logIndex ?? a.index) < Number(b.logIndex ?? b.index));

// fee of every launch in the window: launchFeeWei at the window start, replayed through the
// window's LaunchFeeUpdated logs (a factory deployed inside the window emits one from its constructor).
// flatten: false keeps each factory's logs in targets order; onlyArgs would drop block order.
async function getLaunchFees(options: FetchOptions, factories: string[]): Promise<bigint[]> {
  const [launchBatches, updateBatches, openingFees] = await Promise.all([
    options.getLogs({ targets: factories, eventAbi: TOKEN_LAUNCHED_EVENT, onlyArgs: false, flatten: false }),
    options.getLogs({ targets: factories, eventAbi: LAUNCH_FEE_UPDATED_EVENT, onlyArgs: false, flatten: false }),
    options.fromApi.multiCall({ abi: "uint256:launchFeeWei", calls: factories, permitFailure: true }),
  ]);

  return factories.map((factory, i) => {
    const launches = launchBatches[i] ?? [];
    if (!launches.length) return 0n;

    const updates = [...(updateBatches[i] ?? [])].sort((a: any, b: any) => (isBefore(a, b) ? -1 : 1));
    const openingFee = openingFees[i];

    let total = 0n;
    for (const launch of launches) {
      let fee = openingFee === null || openingFee === undefined ? undefined : BigInt(openingFee);
      for (const update of updates) {
        if (isBefore(update, launch)) fee = BigInt(update.args.launchFeeWei);
      }
      if (fee === undefined) throw new Error(`no launch fee in force for launch at block ${launch.blockNumber} on ${factory}`);
      total += fee;
    }
    return total / NATIVE_TO_ERC20_USDC;
  });
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const factories = GENERATIONS.map((generation) => generation.factory);
  const feeLockers = GENERATIONS.map((generation) => generation.feeLocker);

  // quoteToCreator + quoteToTreasury is the whole collected fee in the quote asset: the token-side
  // fee is sold into the pool before the split, or (first-generation locker) burned and reported as
  // baseBurned, an unpriced launched token that is not counted
  const [harvestBatches, launchFees] = await Promise.all([
    options.getLogs({ targets: feeLockers, eventAbi: FEES_HARVESTED_EVENT, flatten: false }),
    getLaunchFees(options, factories),
  ]);

  const positionCalls: { target: string; params: [string] }[] = [];
  harvestBatches.forEach((harvests: any[], i: number) => {
    for (const id of new Set((harvests ?? []).map((log: any) => log.positionId.toString()))) {
      positionCalls.push({ target: feeLockers[i], params: [id] });
    }
  });
  const positions = positionCalls.length
    ? await options.api.multiCall({ abi: GET_POSITION_ABI, calls: positionCalls })
    : [];
  const quoteOf: Record<string, string> = {};
  positionCalls.forEach((call, i) => { quoteOf[`${call.target}:${call.params[0]}`] = positions[i].quote; });

  harvestBatches.forEach((harvests: any[], i: number) => {
    for (const log of harvests ?? []) {
      const quote = quoteOf[`${feeLockers[i]}:${log.positionId.toString()}`];
      dailyFees.add(quote, log.quoteToCreator, METRIC.SWAP_FEES);
      dailyFees.add(quote, log.quoteToTreasury, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(quote, log.quoteToCreator, LABELS.SwapFeesToCreators);
      dailyRevenue.add(quote, log.quoteToTreasury, LABELS.SwapFeesToTreasury);
    }
  });

  launchFees.forEach((fee) => {
    dailyFees.add(USDC, fee, LABELS.LaunchFees);
    dailyRevenue.add(USDC, fee, LABELS.LaunchFeesToTreasury);
  });

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
  Fees: "The 1% Uniswap V3 LP fee earned by every locked LIFT v1 launch position, counted in the pool's quote asset when the position's fees are harvested (token-side fees burned by the first-generation locker are excluded), plus the flat fee paid for every token launch.",
  UserFees: "Swap fees paid by traders of LIFT v1 tokens and launch fees paid by token deployers.",
  Revenue: "The LIFT treasury share of harvested swap fees plus all launch fees.",
  ProtocolRevenue: "The LIFT treasury share of harvested swap fees plus all launch fees.",
  SupplySideRevenue: "The token creator share of harvested swap fees, fixed per position when it is created.",
  HoldersRevenue: "No fees are distributed to holders of a protocol token.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% LP fee of LIFT v1 pools, counted at harvest time in the quote asset (USDC or EURC). The launched-token side is sold into the same pool before the split, so the 1% paid on that sale is counted again at the next harvest (about 1% of the token-side fees); the first-generation locker burned the launched-token side instead, and those tokens are not counted.",
    [LABELS.LaunchFees]: "Flat fee paid on every token launch (currently 0.1 USDC), as set on the factory at the time of the launch.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "1% LP fee of LIFT v1 pools paid by traders, counted at harvest time.",
    [LABELS.LaunchFees]: "Flat fee paid by token deployers on every launch.",
  },
  Revenue: {
    [LABELS.SwapFeesToTreasury]: "Treasury share of harvested swap fees (currently 30%, fixed per position).",
    [LABELS.LaunchFeesToTreasury]: "All launch fees, swept from the factory to the treasury.",
  },
  ProtocolRevenue: {
    [LABELS.SwapFeesToTreasury]: "Treasury share of harvested swap fees (currently 30%, fixed per position).",
    [LABELS.LaunchFeesToTreasury]: "All launch fees, swept from the factory to the treasury.",
  },
  SupplySideRevenue: {
    [LABELS.SwapFeesToCreators]: "Token creator share of harvested swap fees (currently 70%, fixed per position).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-08",
  doublecounted: true, // the same pools and LP fees are tracked by uniswap-v3 on arc
  methodology,
  breakdownMethodology,
};

export default adapter;
