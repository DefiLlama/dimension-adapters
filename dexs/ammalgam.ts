import { ChainApi } from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { filterPools } from "../helpers/uniswap";

const FACTORY = "0x1a411b0fd1f368d2f413a8cbb6aad425c923015b";
const FACTORY_FROM_BLOCK = 25450093; // First Ethereum mainnet Ammalgam PairCreated block.
// ABI asset-array indices from ITokenController:
// https://github.com/Ammalgam-Protocol/deployments/blob/main/interfaces/tokens/ITokenController.sol
const DEPOSIT_L = 0; // allAssets[0] is deposited liquidity (DEPOSIT_L).
const BORROW_L = 3; // allAssets[3] is borrowed liquidity debt (BORROW_L).
// Five safely bounds block-specific RPC calls while balancing provider load and adapter latency.
const PAIR_STATE_CONCURRENCY = 5;
const SWAP_VOLUME = "Swap Volume";
const SWAP_FEES_TO_LPS = "Swap Fees To LPs";
const BORROW_INTEREST_TO_LPS = "Borrow Interest To LPs";

export const PROTOCOL_FEE_SOURCES = {
  INITIAL_LENDING: "initialLending",
  PROTOCOL_INTEREST: "protocolInterest",
  OVER_REPAY: "overRepay",
  UNCLASSIFIED: "unclassified",
} as const;

type ProtocolFeeSource = typeof PROTOCOL_FEE_SOURCES[keyof typeof PROTOCOL_FEE_SOURCES];

const PROTOCOL_FEE_LABELS: Record<ProtocolFeeSource, { feeLabel: string; revenueLabel: string }> = {
  [PROTOCOL_FEE_SOURCES.INITIAL_LENDING]: {
    feeLabel: "Initial Lending Fees",
    revenueLabel: "Initial Lending Fees To Fee Recipient",
  },
  [PROTOCOL_FEE_SOURCES.PROTOCOL_INTEREST]: {
    feeLabel: "Protocol Interest Fees",
    revenueLabel: "Protocol Interest Fees To Fee Recipient",
  },
  [PROTOCOL_FEE_SOURCES.OVER_REPAY]: {
    feeLabel: "Over-Repay Fees",
    revenueLabel: "Over-Repay Fees To Fee Recipient",
  },
  [PROTOCOL_FEE_SOURCES.UNCLASSIFIED]: {
    feeLabel: "Unclassified Protocol Fees",
    revenueLabel: "Unclassified Protocol Fees To Fee Recipient",
  },
};

const PAIR_CREATED_EVENT =
  "event PairCreated(address indexed tokenX, address indexed tokenY, address pair, uint256 allPairsLength)";
const LENDING_TOKENS_CREATED_EVENT =
  "event LendingTokensCreated(address indexed pair, address depositL, address depositX, address depositY, address borrowL, address borrowX, address borrowY)";
const SWAP_EVENT =
  "event Swap(address indexed sender, uint256 amountXIn, uint256 amountYIn, uint256 amountXOut, uint256 amountYOut, address indexed to)";
const SYNC_EVENT = "event Sync(uint256 reserveXAssets, uint256 reserveYAssets)";
const DEPOSIT_EVENT =
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)";
const LIQUIDITY_MINT_EVENT =
  "event Mint(address indexed sender, address indexed to, uint256 assets, uint256 shares)";
const INTEREST_ACCRUED_EVENT =
  "event InterestAccrued(uint256 reserveXAssets, uint256 reserveYAssets, uint112 depositXAssets, uint112 depositYAssets, uint112 borrowLAssets, uint112 borrowXAssets, uint112 borrowYAssets)";
const BORROW_EVENT =
  "event Borrow(address indexed sender, address indexed to, uint256 assets, uint256 shares)";
const BORROW_LIQUIDITY_EVENT =
  "event BorrowLiquidity(address indexed sender, address indexed to, uint256 assets, uint256 shares)";
const REPAY_EVENT =
  "event Repay(address indexed sender, address indexed onBehalfOf, uint256 assets, uint256 shares)";
const REPAY_LIQUIDITY_EVENT =
  "event RepayLiquidity(address indexed sender, address indexed onBehalfOf, uint256 assets, uint256 shares)";
const GET_RESERVES_ABI =
  "function getReserves() view returns (uint112 reserveXAssets, uint112 reserveYAssets, uint32 lastTimestamp)";
const TOTAL_ASSETS_AND_SHARES_ABI =
  "function totalAssetsAndShares(bool withInterest) view returns (uint112[6] allAssets, uint112[6] allShares)";

interface AmmalgamSwapLog {
  amountXIn: bigint | string | number;
  amountYIn: bigint | string | number;
  amountXOut?: bigint | string | number;
  amountYOut?: bigint | string | number;
}

interface AmmalgamInterestAccruedLog {
  reserveXAssets: bigint | string | number;
  reserveYAssets: bigint | string | number;
}

interface BalanceAdder {
  add: (token: string, amount: bigint | string | number, label?: string) => void;
}

interface ReserveState {
  reserveXAssets: bigint;
  reserveYAssets: bigint;
}

interface PairConfig {
  pair: string;
  tokenX: string;
  tokenY: string;
  depositL: string;
  depositX: string;
  depositY: string;
  borrowL: string;
  borrowX: string;
  borrowY: string;
}

interface PairState {
  reserveXAssets: bigint;
  reserveYAssets: bigint;
  activeLiquidityAssets: bigint;
}

interface LiquidityFeeInput {
  liquidityAssets: bigint | string | number;
  reserveXAssets: bigint | string | number;
  reserveYAssets: bigint | string | number;
  activeLiquidityAssets: bigint | string | number;
}

interface PairStateRequest {
  key: string;
  pair: string;
  block: number;
}

interface ProtocolFeeLog {
  log: any;
}

interface ProtocolFeeSourceLog {
  source: ProtocolFeeSource;
  log: any;
}

type PairEvent = {
  type: "swap" | "sync" | "interest";
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
const toLower = (address: string) => address.toLowerCase();
const getBlockNumber = (log: any) => Number(log.blockNumber ?? log.block_number);
const getLogIndex = (log: any) => Number(log.logIndex ?? log.log_index ?? log.index ?? 0);
const getTransactionKey = (log: any) =>
  String(log.transactionHash ?? log.transaction_hash ?? `${getBlockNumber(log)}:${log.transactionIndex ?? ""}`);
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

export const selectInitialRawReserveState = ({
  latestSyncLog,
  preStartReserve,
}: {
  latestSyncLog?: any;
  preStartReserve: any;
}) => getReserveState(latestSyncLog ? getArgs(latestSyncLog) : preStartReserve);

export const getPairStateKey = (pair: string, block: number) => `${toLower(pair)}:${block}`;
export const getLogKey = (log: any) => `${getBlockNumber(log)}:${getLogIndex(log)}`;
export const getProtocolFeeLabels = (source: ProtocolFeeSource) => PROTOCOL_FEE_LABELS[source];

export const isProtocolFeeMint = (log: any, pair: string) => toLower(String(getArgs(log).sender)) === toLower(pair);

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

export const calculateAmmalgamBorrowInterest = ({
  reserves,
  log,
}: {
  reserves: ReserveState;
  log: AmmalgamInterestAccruedLog;
}) => {
  const updatedReserveXAssets = toBigInt(log.reserveXAssets);
  const updatedReserveYAssets = toBigInt(log.reserveYAssets);

  return {
    interestXForLP: updatedReserveXAssets > reserves.reserveXAssets
      ? updatedReserveXAssets - reserves.reserveXAssets
      : 0n,
    interestYForLP: updatedReserveYAssets > reserves.reserveYAssets
      ? updatedReserveYAssets - reserves.reserveYAssets
      : 0n,
  };
};

export const convertLiquidityFeeToUnderlying = ({
  liquidityAssets,
  reserveXAssets,
  reserveYAssets,
  activeLiquidityAssets,
}: LiquidityFeeInput) => {
  const liquidity = toBigInt(liquidityAssets);
  const activeLiquidity = toBigInt(activeLiquidityAssets);

  if (liquidity === 0n || activeLiquidity <= 0n) {
    return { tokenXAmount: 0n, tokenYAmount: 0n };
  }

  return {
    tokenXAmount: (liquidity * toBigInt(reserveXAssets)) / activeLiquidity,
    tokenYAmount: (liquidity * toBigInt(reserveYAssets)) / activeLiquidity,
  };
};

export const buildPairConfigs = (pairCreatedLogs: any[], lendingTokensCreatedLogs: any[]): PairConfig[] => {
  const pairTokens: Record<string, { tokenX: string; tokenY: string }> = {};
  pairCreatedLogs.forEach((log: any) => {
    const args = getArgs(log);
    pairTokens[toLower(args.pair)] = { tokenX: args.tokenX, tokenY: args.tokenY };
  });

  return lendingTokensCreatedLogs
    .map((log: any) => {
      const args = getArgs(log);
      const pair = args.pair;
      const tokens = pairTokens[toLower(pair)];
      if (!tokens) return undefined;

      return {
        pair,
        tokenX: tokens.tokenX,
        tokenY: tokens.tokenY,
        depositL: args.depositL,
        depositX: args.depositX,
        depositY: args.depositY,
        borrowL: args.borrowL,
        borrowX: args.borrowX,
        borrowY: args.borrowY,
      };
    })
    .filter(Boolean) as PairConfig[];
};

export const buildPairStateRequests = (pairConfigs: PairConfig[], depositLLogs: any[][]): PairStateRequest[] => {
  const requests = new Map<string, PairStateRequest>();
  pairConfigs.forEach((config, index) => {
    (depositLLogs[index] ?? []).forEach((log: any) => {
      if (!isProtocolFeeMint(log, config.pair)) return;

      const block = getBlockNumber(log);
      const key = getPairStateKey(config.pair, block);
      if (!requests.has(key)) requests.set(key, { key, pair: config.pair, block });
    });
  });

  return Array.from(requests.values());
};

export const buildProtocolFeeSourceMap = ({
  protocolFeeLogs,
  sourceLogs,
}: {
  protocolFeeLogs: ProtocolFeeLog[];
  sourceLogs: ProtocolFeeSourceLog[];
}) => {
  const sourceByTransaction = new Map<string, ProtocolFeeSource>();
  const sourceByFeeLog = new Map<string, ProtocolFeeSource>();
  const timeline = [
    ...sourceLogs.map((entry) => ({ type: "source" as const, ...entry })),
    ...protocolFeeLogs.map((entry) => ({ type: "fee" as const, ...entry })),
  ].sort((a, b) => sortLogs(a.log, b.log));

  timeline.forEach((entry) => {
    const transactionKey = getTransactionKey(entry.log);
    if (entry.type === "source") {
      sourceByTransaction.set(transactionKey, entry.source);
      return;
    }

    const source = sourceByTransaction.get(transactionKey);
    if (source) sourceByFeeLog.set(getLogKey(entry.log), source);
  });

  return sourceByFeeLog;
};

const getPairState = async ({ chain, pair, block }: { chain: string; pair: string; block: number }): Promise<PairState> => {
  const blockApi = new ChainApi({ chain, block });
  const [reserves, totalAssetsAndShares] = await Promise.all([
    blockApi.call({ target: pair, abi: GET_RESERVES_ABI }),
    blockApi.call({ target: pair, abi: TOTAL_ASSETS_AND_SHARES_ABI, params: [true] as any }),
  ]);

  const allAssets = totalAssetsAndShares.allAssets ?? totalAssetsAndShares[0];
  const depositLAssets = toBigInt(allAssets[DEPOSIT_L]);
  const borrowLAssets = toBigInt(allAssets[BORROW_L]);

  return {
    reserveXAssets: toBigInt(reserves.reserveXAssets ?? reserves[0]),
    reserveYAssets: toBigInt(reserves.reserveYAssets ?? reserves[1]),
    activeLiquidityAssets: depositLAssets - borrowLAssets,
  };
};

const resolvePairStateMap = async ({ chain, requests }: { chain: string; requests: PairStateRequest[] }) => {
  const { results, errors } = await PromisePool.withConcurrency(PAIR_STATE_CONCURRENCY)
    .for(requests)
    .process(async ({ key, pair, block }) => [key, await getPairState({ chain, pair, block })] as [string, PairState]);

  if (errors.length) throw errors[0];
  return new Map(results);
};

const updateReservesFromSwap = (reserves: ReserveState, log: AmmalgamSwapLog) => {
  reserves.reserveXAssets = reserves.reserveXAssets + toBigInt(log.amountXIn) - toBigInt(log.amountXOut ?? 0);
  reserves.reserveYAssets = reserves.reserveYAssets + toBigInt(log.amountYIn) - toBigInt(log.amountYOut ?? 0);
};

const updateReservesFromInterestAccrued = (reserves: ReserveState, log: AmmalgamInterestAccruedLog) => {
  reserves.reserveXAssets = toBigInt(log.reserveXAssets);
  reserves.reserveYAssets = toBigInt(log.reserveYAssets);
};

const addSwapFee = ({
  dailyFees,
  dailyUserFees,
  dailySupplySideRevenue,
  token,
  amount,
}: {
  dailyFees: BalanceAdder;
  dailyUserFees: BalanceAdder;
  dailySupplySideRevenue: BalanceAdder;
  token: string;
  amount: bigint;
}) => {
  dailyFees.add(token, amount, METRIC.SWAP_FEES);
  dailyUserFees.add(token, amount, METRIC.SWAP_FEES);
  dailySupplySideRevenue.add(token, amount, SWAP_FEES_TO_LPS);
};

const addBorrowInterest = ({
  dailyFees,
  dailyUserFees,
  dailySupplySideRevenue,
  token,
  amount,
}: {
  dailyFees: BalanceAdder;
  dailyUserFees: BalanceAdder;
  dailySupplySideRevenue: BalanceAdder;
  token: string;
  amount: bigint;
}) => {
  dailyFees.add(token, amount, METRIC.BORROW_INTEREST);
  dailyUserFees.add(token, amount, METRIC.BORROW_INTEREST);
  dailySupplySideRevenue.add(token, amount, BORROW_INTEREST_TO_LPS);
};

const addProtocolFee = ({
  dailyFees,
  dailyUserFees,
  dailyProtocolRevenue,
  token,
  amount,
  source,
}: {
  dailyFees: BalanceAdder;
  dailyUserFees: BalanceAdder;
  dailyProtocolRevenue: BalanceAdder;
  token: string;
  amount: bigint | string | number;
  source: ProtocolFeeSource;
}) => {
  const value = toBigInt(amount);
  if (value <= 0n) return;

  const labels = getProtocolFeeLabels(source);
  dailyFees.add(token, value, labels.feeLabel);
  dailyUserFees.add(token, value, labels.feeLabel);
  dailyProtocolRevenue.add(token, value, labels.revenueLabel);
};

const toPairEvent = (type: PairEvent["type"]) => (log: any): PairEvent => ({
  type,
  blockNumber: Number(log.blockNumber),
  logIndex: getLogIndex(log),
  log,
});

const sortPairEvents = (a: PairEvent, b: PairEvent) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
const sortLogs = (a: any, b: any) => getBlockNumber(a) - getBlockNumber(b) || getLogIndex(a) - getLogIndex(b);

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [pairCreatedLogs, lendingTokensCreatedLogs] = await Promise.all([
    options.getLogs({
      target: FACTORY,
      eventAbi: PAIR_CREATED_EVENT,
      fromBlock: FACTORY_FROM_BLOCK,
      cacheInCloud: true,
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      target: FACTORY,
      eventAbi: LENDING_TOKENS_CREATED_EVENT,
      fromBlock: FACTORY_FROM_BLOCK,
      cacheInCloud: true,
      entireLog: true,
      parseLog: true,
    }),
  ]);

  const pairObject: Record<string, string[]> = {};
  const pairCreatedBlock: Record<string, number> = {};
  pairCreatedLogs.forEach((log: any) => {
    const args = getArgs(log);
    pairObject[args.pair] = [args.tokenX, args.tokenY];
    pairCreatedBlock[args.pair] = Number(log.blockNumber);
  });

  const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances });
  const pairIds = Object.keys(filteredPairs);
  const pairConfigs = buildPairConfigs(pairCreatedLogs, lendingTokensCreatedLogs);

  if (pairIds.length) {
    const [fromBlock, swapLogs, syncLogs, interestLogs] = await Promise.all([
      options.getFromBlock(),
      options.getLogs({
        targets: pairIds,
        eventAbi: SWAP_EVENT,
        flatten: false,
        entireLog: true,
        parseLog: true,
      }),
      options.getLogs({
        targets: pairIds,
        eventAbi: SYNC_EVENT,
        flatten: false,
        entireLog: true,
        parseLog: true,
      }),
      options.getLogs({
        targets: pairIds,
        eventAbi: INTEREST_ACCRUED_EVENT,
        flatten: false,
        entireLog: true,
        parseLog: true,
      }),
    ]);

    const preStartBlock = fromBlock - 1;
    const initialSwapReserves = pairIds.map(emptyReserveState);
    const initialRawReserves = pairIds.map(emptyReserveState);
    const preExistingPairCalls = pairIds
      .map((pair, index) => ({ target: pair, index }))
      .filter(({ target }) => pairCreatedBlock[target] <= preStartBlock);

    if (preExistingPairCalls.length) {
      const preExistingPairs = preExistingPairCalls.map(({ target }) => target);
      const preStartApi = new ChainApi({ chain: options.chain, block: preStartBlock });
      const [preStartReserves, preStartSyncLogs] = await Promise.all([
        preStartApi.multiCall({
          calls: preExistingPairs,
          abi: GET_RESERVES_ABI,
        }),
        options.getLogs({
          targets: preExistingPairs,
          eventAbi: SYNC_EVENT,
          fromBlock: FACTORY_FROM_BLOCK,
          toBlock: preStartBlock,
          flatten: false,
          entireLog: true,
          parseLog: true,
          cacheInCloud: true,
        }),
      ]);

      preStartReserves.forEach((reserves: any, index: number) => {
        initialSwapReserves[preExistingPairCalls[index].index] = getReserveState(reserves);
      });

      preExistingPairCalls.forEach(({ index: pairIndex }, index: number) => {
        const logs = preStartSyncLogs[index] ?? [];
        const sortedLogs = [...logs].sort(sortLogs);
        const latestSyncLog = sortedLogs[sortedLogs.length - 1];
        initialRawReserves[pairIndex] = selectInitialRawReserveState({
          latestSyncLog,
          preStartReserve: preStartReserves[index],
        });
      });
    }

    pairIds.forEach((_, index) => {
      const [tokenX, tokenY] = pairObject[pairIds[index]];
      const swapReserves = getReserveState(initialSwapReserves[index]);
      const rawReserves = getReserveState(initialRawReserves[index]);
      const pairEvents = [
        ...(swapLogs[index] ?? []).map(toPairEvent("swap")),
        ...(syncLogs[index] ?? []).map(toPairEvent("sync")),
        ...(interestLogs[index] ?? []).map(toPairEvent("interest")),
      ].sort(sortPairEvents);

      pairEvents.forEach(({ type, log }) => {
        const args = getArgs(log);

        if (type === "interest") {
          const { interestXForLP, interestYForLP } = calculateAmmalgamBorrowInterest({
            reserves: rawReserves,
            log: args,
          });
          if (interestXForLP > 0n) {
            addBorrowInterest({ dailyFees, dailyUserFees, dailySupplySideRevenue, token: tokenX, amount: interestXForLP });
          }
          if (interestYForLP > 0n) {
            addBorrowInterest({ dailyFees, dailyUserFees, dailySupplySideRevenue, token: tokenY, amount: interestYForLP });
          }

          updateReservesFromInterestAccrued(rawReserves, args);
          updateReservesFromInterestAccrued(swapReserves, args);
          return;
        }

        if (type === "sync") {
          rawReserves.reserveXAssets = toBigInt(args.reserveXAssets);
          rawReserves.reserveYAssets = toBigInt(args.reserveYAssets);
          swapReserves.reserveXAssets = rawReserves.reserveXAssets;
          swapReserves.reserveYAssets = rawReserves.reserveYAssets;
          return;
        }

        addAmmalgamSwapVolume({ dailyVolume, tokenX, tokenY, log: args });

        const { feeX, feeY } = calculateAmmalgamSwapFee({ reserves: swapReserves, log: args });
        if (feeX > 0n) addSwapFee({ dailyFees, dailyUserFees, dailySupplySideRevenue, token: tokenX, amount: feeX });
        if (feeY > 0n) addSwapFee({ dailyFees, dailyUserFees, dailySupplySideRevenue, token: tokenY, amount: feeY });

        updateReservesFromSwap(rawReserves, args);
        updateReservesFromSwap(swapReserves, args);
      });
    });
  }

  if (pairConfigs.length) {
    const [depositXLogs, depositYLogs, depositLLogs, interestAccruedLogs, borrowLogs, borrowLiquidityLogs, repayLogs, repayLiquidityLogs] = await Promise.all([
      options.getLogs({
        targets: pairConfigs.map(({ depositX }) => depositX),
        eventAbi: DEPOSIT_EVENT,
        flatten: false,
        entireLog: true,
      }),
      options.getLogs({
        targets: pairConfigs.map(({ depositY }) => depositY),
        eventAbi: DEPOSIT_EVENT,
        flatten: false,
        entireLog: true,
      }),
      options.getLogs({
        targets: pairConfigs.map(({ depositL }) => depositL),
        eventAbi: LIQUIDITY_MINT_EVENT,
        flatten: false,
        entireLog: true,
      }),
      options.getLogs({
        targets: pairConfigs.map(({ pair }) => pair),
        eventAbi: INTEREST_ACCRUED_EVENT,
        entireLog: true,
      }),
      options.getLogs({
        targets: pairConfigs.flatMap(({ borrowX, borrowY }) => [borrowX, borrowY]),
        eventAbi: BORROW_EVENT,
        entireLog: true,
      }),
      options.getLogs({
        targets: pairConfigs.map(({ borrowL }) => borrowL),
        eventAbi: BORROW_LIQUIDITY_EVENT,
        entireLog: true,
      }),
      options.getLogs({
        targets: pairConfigs.flatMap(({ borrowX, borrowY }) => [borrowX, borrowY]),
        eventAbi: REPAY_EVENT,
        entireLog: true,
      }),
      options.getLogs({
        targets: pairConfigs.map(({ borrowL }) => borrowL),
        eventAbi: REPAY_LIQUIDITY_EVENT,
        entireLog: true,
      }),
    ]);

    const protocolFeeLogs = pairConfigs.flatMap((config, index) => [
      ...(depositXLogs[index] ?? []).filter((log: any) => isProtocolFeeMint(log, config.pair)).map((log: any) => ({ log })),
      ...(depositYLogs[index] ?? []).filter((log: any) => isProtocolFeeMint(log, config.pair)).map((log: any) => ({ log })),
      ...(depositLLogs[index] ?? []).filter((log: any) => isProtocolFeeMint(log, config.pair)).map((log: any) => ({ log })),
    ]);
    const sourceLogs = [
      ...interestAccruedLogs.map((log: any) => ({ source: PROTOCOL_FEE_SOURCES.PROTOCOL_INTEREST, log })),
      ...borrowLogs.map((log: any) => ({ source: PROTOCOL_FEE_SOURCES.INITIAL_LENDING, log })),
      ...borrowLiquidityLogs.map((log: any) => ({ source: PROTOCOL_FEE_SOURCES.INITIAL_LENDING, log })),
      ...repayLogs.map((log: any) => ({ source: PROTOCOL_FEE_SOURCES.OVER_REPAY, log })),
      ...repayLiquidityLogs.map((log: any) => ({ source: PROTOCOL_FEE_SOURCES.OVER_REPAY, log })),
    ];
    const protocolFeeSourceByLogKey = buildProtocolFeeSourceMap({ protocolFeeLogs, sourceLogs });
    const pairStateByKey = await resolvePairStateMap({
      chain: options.chain,
      requests: buildPairStateRequests(pairConfigs, depositLLogs),
    });
    const getProtocolFeeSource = (log: any) => protocolFeeSourceByLogKey.get(getLogKey(log)) ?? PROTOCOL_FEE_SOURCES.UNCLASSIFIED;

    pairConfigs.forEach((config, index) => {
      (depositXLogs[index] ?? []).forEach((log: any) => {
        if (!isProtocolFeeMint(log, config.pair)) return;
        addProtocolFee({
          dailyFees,
          dailyUserFees,
          dailyProtocolRevenue,
          token: config.tokenX,
          amount: getArgs(log).assets,
          source: getProtocolFeeSource(log),
        });
      });

      (depositYLogs[index] ?? []).forEach((log: any) => {
        if (!isProtocolFeeMint(log, config.pair)) return;
        addProtocolFee({
          dailyFees,
          dailyUserFees,
          dailyProtocolRevenue,
          token: config.tokenY,
          amount: getArgs(log).assets,
          source: getProtocolFeeSource(log),
        });
      });
    });

    for (const [index, config] of pairConfigs.entries()) {
      for (const log of depositLLogs[index] ?? []) {
        if (!isProtocolFeeMint(log, config.pair)) continue;

        const state = pairStateByKey.get(getPairStateKey(config.pair, getBlockNumber(log)));
        if (!state) throw new Error(`Missing Ammalgam pair state for ${config.pair} at block ${getBlockNumber(log)}`);
        const source = getProtocolFeeSource(log);
        const { tokenXAmount, tokenYAmount } = convertLiquidityFeeToUnderlying({
          liquidityAssets: getArgs(log).assets,
          reserveXAssets: state.reserveXAssets,
          reserveYAssets: state.reserveYAssets,
          activeLiquidityAssets: state.activeLiquidityAssets,
        });

        addProtocolFee({
          dailyFees,
          dailyUserFees,
          dailyProtocolRevenue,
          token: config.tokenX,
          amount: tokenXAmount,
          source,
        });
        addProtocolFee({
          dailyFees,
          dailyUserFees,
          dailyProtocolRevenue,
          token: config.tokenY,
          amount: tokenYAmount,
          source,
        });
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume:
    "Swap volume from Ammalgam pairs deployed by the Ethereum mainnet factory. Volume is counted from the input side of each Swap event only: amountXIn for tokenX and amountYIn for tokenY.",
  Fees:
    "Swap fees inferred from each swap's actual input minus the no-fee input required by the pre-swap reserve invariant for the observed output, the LP reserve-growth portion of borrow interest emitted by InterestAccrued, and protocol-retained lending fees minted to the Ammalgam fee recipient. Ammalgam swap fees are dynamic; see https://docs.ammalgam.xyz/docs/developer-guide/contracts/libraries/QuadraticSwapFees.",
  UserFees:
    "Swap fees paid by traders, borrow interest paid by borrowers into LP reserves, and protocol-retained lending fees paid by borrowers and over-repayers.",
  Revenue:
    "Protocol-retained lending fees minted to the Ammalgam fee recipient. No protocol fees are taken from swaps.",
  SupplySideRevenue: "Swap fees and the LP reserve-growth portion of borrow interest accrue to liquidity providers.",
  ProtocolRevenue: "Protocol-retained lending fees minted to the Ammalgam fee recipient. No protocol fees are taken from swaps.",
};

const breakdownMethodology = {
  Volume: {
    [SWAP_VOLUME]: "Input-side token amounts from Ammalgam Swap events.",
  },
  Fees: {
    [METRIC.SWAP_FEES]:
      "Input-token fees inferred from actual input less no-fee invariant input. Ammalgam swap fees are dynamic: https://docs.ammalgam.xyz/docs/developer-guide/contracts/libraries/QuadraticSwapFees.",
    [METRIC.BORROW_INTEREST]:
      "LP share of borrow interest inferred from each InterestAccrued event's post-interest reserves minus the tracked pre-interest raw reserves.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.INITIAL_LENDING].feeLabel]:
      "Initial lending fees charged when users borrow token X, token Y, or liquidity from Ammalgam pairs.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.PROTOCOL_INTEREST].feeLabel]:
      "Protocol share of lending interest accrued by Ammalgam pairs.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.OVER_REPAY].feeLabel]:
      "Over-repay amounts retained by the protocol when repayment exceeds the outstanding debt.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.UNCLASSIFIED].feeLabel]:
      "Protocol fee mints whose transaction source event was unavailable in the adapter log window.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders.",
    [METRIC.BORROW_INTEREST]: "Borrow interest paid by borrowers into LP reserves.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.INITIAL_LENDING].feeLabel]:
      "Initial lending fees charged when users borrow token X, token Y, or liquidity from Ammalgam pairs.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.PROTOCOL_INTEREST].feeLabel]:
      "Protocol share of lending interest accrued by Ammalgam pairs.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.OVER_REPAY].feeLabel]:
      "Over-repay amounts retained by the protocol when repayment exceeds the outstanding debt.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.UNCLASSIFIED].feeLabel]:
      "Protocol fee mints whose transaction source event was unavailable in the adapter log window.",
  },
  Revenue: {
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.INITIAL_LENDING].revenueLabel]:
      "Initial lending fees minted to the Ammalgam factory fee recipient.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.PROTOCOL_INTEREST].revenueLabel]:
      "Protocol interest fees minted to the Ammalgam factory fee recipient.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.OVER_REPAY].revenueLabel]:
      "Over-repay fees minted to the Ammalgam factory fee recipient.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.UNCLASSIFIED].revenueLabel]:
      "Protocol fee mints to the Ammalgam factory fee recipient whose transaction source event was unavailable in the adapter log window.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_LPS]: "Swap fees accruing to liquidity providers. No protocol fees are taken from swaps.",
    [BORROW_INTEREST_TO_LPS]: "LP reserve-growth portion of borrow interest accruing to liquidity providers.",
  },
  ProtocolRevenue: {
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.INITIAL_LENDING].revenueLabel]:
      "Initial lending fees minted to the Ammalgam factory fee recipient.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.PROTOCOL_INTEREST].revenueLabel]:
      "Protocol interest fees minted to the Ammalgam factory fee recipient.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.OVER_REPAY].revenueLabel]:
      "Over-repay fees minted to the Ammalgam factory fee recipient.",
    [PROTOCOL_FEE_LABELS[PROTOCOL_FEE_SOURCES.UNCLASSIFIED].revenueLabel]:
      "Protocol fee mints to the Ammalgam factory fee recipient whose transaction source event was unavailable in the adapter log window.",
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
