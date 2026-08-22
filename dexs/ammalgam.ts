import { ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { filterPools } from "../helpers/uniswap";

const FACTORY = "0x1a411b0fd1f368d2f413a8cbb6aad425c923015b";
const FACTORY_FROM_BLOCK = 25450093; // First Ethereum mainnet Ammalgam PairCreated block.
const SWAP_VOLUME = "Swap Volume";
const TRADING_FEES = "Trading fees";
const LP_FEES = "LP fees";

const PAIR_CREATED_EVENT =
  "event PairCreated(address indexed tokenX, address indexed tokenY, address pair, uint256 allPairsLength)";
const SWAP_EVENT =
  "event Swap(address indexed sender, uint256 amountXIn, uint256 amountYIn, uint256 amountXOut, uint256 amountYOut, address indexed to)";
const SYNC_EVENT = "event Sync(uint256 reserveXAssets, uint256 reserveYAssets)";
const GET_RESERVES_ABI =
  "function getReserves() view returns (uint112 reserveXAssets, uint112 reserveYAssets, uint32 lastTimestamp)";

interface AmmalgamSwapLog {
  amountXIn: bigint | string | number;
  amountYIn: bigint | string | number;
  amountXOut?: bigint | string | number;
  amountYOut?: bigint | string | number;
}

interface BalanceAdder {
  add: (token: string, amount: bigint | string | number, label?: string) => void;
}

interface ReserveState {
  reserveXAssets: bigint;
  reserveYAssets: bigint;
}

type PairEvent = {
  type: "swap" | "sync";
  blockNumber: number;
  logIndex: number;
  log: any;
};

const emptyReserveState = (): ReserveState => ({
  reserveXAssets: 0n,
  reserveYAssets: 0n,
});

const toBigInt = (amount: bigint | string | number) => BigInt(amount.toString());
const isPositiveAmount = (amount: bigint | string | number) => BigInt(amount.toString()) > 0n;
const getArgs = (log: any) => log.args ?? log;
const getLogIndex = (log: any) => Number(log.logIndex ?? log.index ?? 0);
const ceilDiv = (numerator: bigint, denominator: bigint) => (numerator + denominator - 1n) / denominator;

const amountInForNoFeeSwap = (reserveIn: bigint, reserveOut: bigint, amountOut: bigint) => {
  if (amountOut === 0n) return 0n;

  const reserveOutAfterSwap = reserveOut - amountOut;
  return ceilDiv(reserveIn * amountOut, reserveOutAfterSwap);
};

const getReserveState = (reserves: any): ReserveState => ({
  reserveXAssets: toBigInt(reserves.reserveXAssets ?? reserves[0]),
  reserveYAssets: toBigInt(reserves.reserveYAssets ?? reserves[1]),
});

export const addAmmalgamSwapVolume = ({
  dailyVolume,
  tokenX,
  tokenY,
  log,
}: {
  dailyVolume: BalanceAdder;
  tokenX: string;
  tokenY: string;
  log: AmmalgamSwapLog;
}) => {
  if (isPositiveAmount(log.amountXIn)) dailyVolume.add(tokenX, log.amountXIn, SWAP_VOLUME);
  if (isPositiveAmount(log.amountYIn)) dailyVolume.add(tokenY, log.amountYIn, SWAP_VOLUME);
};

export const calculateAmmalgamSwapFee = ({
  reserves,
  log,
}: {
  reserves: ReserveState;
  log: AmmalgamSwapLog;
}) => {
  const amountXIn = toBigInt(log.amountXIn);
  const amountYIn = toBigInt(log.amountYIn);
  const amountXOut = toBigInt(log.amountXOut ?? 0);
  const amountYOut = toBigInt(log.amountYOut ?? 0);
  let feeX = 0n;
  let feeY = 0n;

  if (amountXIn > 0n && amountYOut > 0n) {
    const noFeeAmountXIn = amountInForNoFeeSwap(reserves.reserveXAssets, reserves.reserveYAssets, amountYOut);
    if (amountXIn > noFeeAmountXIn) feeX = amountXIn - noFeeAmountXIn;
  }

  if (amountYIn > 0n && amountXOut > 0n) {
    const noFeeAmountYIn = amountInForNoFeeSwap(reserves.reserveYAssets, reserves.reserveXAssets, amountXOut);
    if (amountYIn > noFeeAmountYIn) feeY = amountYIn - noFeeAmountYIn;
  }

  return { feeX, feeY };
};

const updateReservesFromSwap = (reserves: ReserveState, log: AmmalgamSwapLog) => {
  reserves.reserveXAssets = reserves.reserveXAssets + toBigInt(log.amountXIn) - toBigInt(log.amountXOut ?? 0);
  reserves.reserveYAssets = reserves.reserveYAssets + toBigInt(log.amountYIn) - toBigInt(log.amountYOut ?? 0);
};

const toPairEvent = (type: PairEvent["type"]) => (log: any): PairEvent => ({
  type,
  blockNumber: Number(log.blockNumber),
  logIndex: getLogIndex(log),
  log,
});

const sortPairEvents = (a: PairEvent, b: PairEvent) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const pairCreatedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: PAIR_CREATED_EVENT,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
    entireLog: true,
  });

  const pairObject: Record<string, string[]> = {};
  const pairCreatedBlock: Record<string, number> = {};
  pairCreatedLogs.forEach((log: any) => {
    const args = getArgs(log);
    pairObject[args.pair] = [args.tokenX, args.tokenY];
    pairCreatedBlock[args.pair] = Number(log.blockNumber);
  });

  const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances });
  const pairIds = Object.keys(filteredPairs);
  if (!pairIds.length) {
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees.clone(1, TRADING_FEES),
      dailyRevenue: 0,
      dailySupplySideRevenue: dailyFees.clone(1, LP_FEES),
      dailyProtocolRevenue: 0,
    };
  }

  const [fromBlock, swapLogs, syncLogs] = await Promise.all([
    options.getFromBlock(),
    options.getLogs({
      targets: pairIds,
      eventAbi: SWAP_EVENT,
      flatten: false,
      entireLog: true,
    }),
    options.getLogs({
      targets: pairIds,
      eventAbi: SYNC_EVENT,
      flatten: false,
      entireLog: true,
    }),
  ]);

  const preStartBlock = fromBlock - 1;
  const initialReserves = pairIds.map(emptyReserveState);
  const preExistingPairCalls = pairIds
    .map((pair, index) => ({ target: pair, index }))
    .filter(({ target }) => pairCreatedBlock[target] <= preStartBlock);

  if (preExistingPairCalls.length) {
    const preStartApi = new ChainApi({ chain: options.chain, block: preStartBlock });
    const preStartReserves = await preStartApi.multiCall({
      calls: preExistingPairCalls.map(({ target }) => target),
      abi: GET_RESERVES_ABI,
    });

    preStartReserves.forEach((reserves: any, index: number) => {
      initialReserves[preExistingPairCalls[index].index] = getReserveState(reserves);
    });
  }

  swapLogs.forEach((logs: any[], index: number) => {
    const [tokenX, tokenY] = pairObject[pairIds[index]];
    const reserves = getReserveState(initialReserves[index]);
    const pairEvents = [
      ...logs.map(toPairEvent("swap")),
      ...(syncLogs[index] ?? []).map(toPairEvent("sync")),
    ].sort(sortPairEvents);

    pairEvents.forEach(({ type, log }) => {
      const args = getArgs(log);

      if (type === "sync") {
        reserves.reserveXAssets = toBigInt(args.reserveXAssets);
        reserves.reserveYAssets = toBigInt(args.reserveYAssets);
        return;
      }

      addAmmalgamSwapVolume({ dailyVolume, tokenX, tokenY, log: args });

      const { feeX, feeY } = calculateAmmalgamSwapFee({ reserves, log: args });
      if (feeX > 0n) dailyFees.add(tokenX, feeX, METRIC.SWAP_FEES);
      if (feeY > 0n) dailyFees.add(tokenY, feeY, METRIC.SWAP_FEES);

      updateReservesFromSwap(reserves, args);
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1, TRADING_FEES),
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees.clone(1, LP_FEES),
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Swap volume from Ammalgam pairs deployed by the Ethereum mainnet factory. Volume is counted from the input side of each Swap event only: amountXIn for tokenX and amountYIn for tokenY.",
  Fees:
    "Swap fees inferred from each swap's actual input minus the no-fee input required by the pre-swap reserve invariant for the observed output. Ammalgam swap fees are dynamic; see https://docs.ammalgam.xyz/docs/developer-guide/contracts/libraries/QuadraticSwapFees.",
  UserFees: "Swap fees paid by traders.",
  Revenue: "No protocol fees are taken from swaps.",
  SupplySideRevenue: "Swap fees accrue to liquidity providers.",
  ProtocolRevenue: "No protocol fees are taken from swaps.",
};

const breakdownMethodology = {
  Volume: {
    [SWAP_VOLUME]: "Input-side token amounts from Ammalgam Swap events.",
  },
  Fees: {
    [METRIC.SWAP_FEES]:
      "Input-token fees inferred from actual input less no-fee invariant input. Ammalgam swap fees are dynamic: https://docs.ammalgam.xyz/docs/developer-guide/contracts/libraries/QuadraticSwapFees.",
  },
  UserFees: {
    [TRADING_FEES]: "Swap fees paid by traders.",
  },
  SupplySideRevenue: {
    [LP_FEES]: "Swap fees accruing to liquidity providers. No protocol fees are taken from swaps.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-07-03",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
