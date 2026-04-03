import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import {
  getAccumulatedInterestAtBlock,
  getPositionAtBlock,
  getPositionIds,
  mulDivCeil,
  normalizePosition,
  toBigIntSafe,
  toPositionId,
  TRISTERO_MARGIN_ABI,
  TRISTERO_MARGIN_CONFIG,
  type TristeroMarginPosition,
} from "../helpers/tristeroMargin";

type ProtocolFeeLog = {
  token: string;
  amount: bigint;
};

function eventKey(log: any): string {
  return `${String(log.transactionHash).toLowerCase()}-${toPositionId(log.args.positionId)}`;
}

function addToPositionMap(map: Map<number, bigint>, positionId: number, amount: bigint) {
  map.set(positionId, (map.get(positionId) ?? 0n) + amount);
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const borrowInterestFees = options.createBalances();
  const borrowInterestProtocolRevenue = options.createBalances();
  const liquidationProtocolFees = options.createBalances();

  const realizedBorrowInterestByPosition = new Map<number, bigint>();
  const knownPositions = new Map<number, TristeroMarginPosition>();
  const relevantPositionIds = new Set<number>();

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);

  const [closeLogs, liquidationLogs, protocolFeeLogs] = await Promise.all([
    options.getLogs({
      target: TRISTERO_MARGIN_CONFIG.escrow,
      eventAbi: TRISTERO_MARGIN_ABI.positionClosed,
      fromBlock,
      toBlock,
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      target: TRISTERO_MARGIN_CONFIG.escrow,
      eventAbi: TRISTERO_MARGIN_ABI.positionLiquidated,
      fromBlock,
      toBlock,
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      target: TRISTERO_MARGIN_CONFIG.escrow,
      eventAbi: TRISTERO_MARGIN_ABI.protocolFeeCollected,
      fromBlock,
      toBlock,
      entireLog: true,
      parseLog: true,
    }),
  ]);

  const protocolFeesByEvent = new Map<string, ProtocolFeeLog[]>();
  protocolFeeLogs.forEach((log: any) => {
    const key = eventKey(log);
    const logs = protocolFeesByEvent.get(key) ?? [];
    logs.push({
      token: String(log.args.token).toLowerCase(),
      amount: toBigIntSafe(log.args.amount),
    });
    protocolFeesByEvent.set(key, logs);
  });

  await Promise.all(closeLogs.map(async (log: any) => {
    const positionId = toPositionId(log.args.positionId);
    relevantPositionIds.add(positionId);

    const block = Number(log.blockNumber) - 1;
    if (block < 0) return;

    const prePosition = await getPositionAtBlock(options, positionId, block);
    if (!prePosition || prePosition.size === 0n) return;

    knownPositions.set(positionId, prePosition);

    const protocolFees = (protocolFeesByEvent.get(eventKey(log)) ?? [])
      .filter((fee) => fee.token === prePosition.loanToken.toLowerCase())
      .reduce((sum, fee) => sum + fee.amount, 0n);

    const closedSize = toBigIntSafe(log.args.closedSize);
    if (closedSize === 0n) return;

    const principalClosed = mulDivCeil(prePosition.loanAmount, closedSize, prePosition.size);
    const repaidDebt = toBigIntSafe(log.args.loanerRepayment) + protocolFees;
    const realizedInterest = repaidDebt > principalClosed ? repaidDebt - principalClosed : 0n;

    if (realizedInterest > 0n) {
      addToPositionMap(realizedBorrowInterestByPosition, positionId, realizedInterest);
    }

    if (protocolFees > 0n) {
      borrowInterestProtocolRevenue.add(prePosition.loanToken, protocolFees.toString(), METRIC.BORROW_INTEREST);
    }
  }));

  await Promise.all(liquidationLogs.map(async (log: any) => {
    const positionId = toPositionId(log.args.positionId);
    relevantPositionIds.add(positionId);

    const block = Number(log.blockNumber) - 1;
    if (block < 0) return;

    const [prePosition, preAccruedInterest] = await Promise.all([
      getPositionAtBlock(options, positionId, block),
      getAccumulatedInterestAtBlock(options, positionId, block),
    ]);
    if (!prePosition) return;

    knownPositions.set(positionId, prePosition);

    if (preAccruedInterest > 0n) {
      addToPositionMap(realizedBorrowInterestByPosition, positionId, preAccruedInterest);
    }

    const liquidationFees = (protocolFeesByEvent.get(eventKey(log)) ?? [])
      .filter((fee) => fee.token === prePosition.token.toLowerCase())
      .reduce((sum, fee) => sum + fee.amount, 0n);

    if (liquidationFees > 0n) {
      liquidationProtocolFees.add(prePosition.token, liquidationFees.toString(), METRIC.LIQUIDATION_FEES);
    }
  }));

  const totalPositions = await options.toApi.call({
    target: TRISTERO_MARGIN_CONFIG.escrow,
    abi: TRISTERO_MARGIN_ABI.totalPositions,
  });
  const positionIds = getPositionIds(totalPositions);

  const endPositionsRaw = positionIds.length
    ? await options.toApi.multiCall({
      abi: TRISTERO_MARGIN_ABI.positions,
      calls: positionIds.map((positionId) => ({
        target: TRISTERO_MARGIN_CONFIG.escrow,
        params: [positionId],
      })),
      permitFailure: true,
    })
    : [];

  endPositionsRaw.forEach((position: any, index: number) => {
    const normalized = normalizePosition(position);
    if (!normalized || normalized.size === 0n) return;

    const positionId = positionIds[index];
    relevantPositionIds.add(positionId);
    knownPositions.set(positionId, normalized);
  });

  const trackedPositionIds = Array.from(relevantPositionIds);
  const [startAccruedRaw, endAccruedRaw] = trackedPositionIds.length
    ? await Promise.all([
      options.fromApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
        calls: trackedPositionIds.map((positionId) => ({
          target: TRISTERO_MARGIN_CONFIG.escrow,
          params: [positionId],
        })),
        permitFailure: true,
      }),
      options.toApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
        calls: trackedPositionIds.map((positionId) => ({
          target: TRISTERO_MARGIN_CONFIG.escrow,
          params: [positionId],
        })),
        permitFailure: true,
      }),
    ])
    : [[], []];

  trackedPositionIds.forEach((positionId, index) => {
    const position = knownPositions.get(positionId);
    if (!position) return;

    const startAccrued = toBigIntSafe(startAccruedRaw[index]);
    const endAccrued = toBigIntSafe(endAccruedRaw[index]);
    const realizedInterest = realizedBorrowInterestByPosition.get(positionId) ?? 0n;

    const accruedDuringPeriod = realizedInterest + endAccrued - startAccrued;
    if (accruedDuringPeriod <= 0n) return;

    borrowInterestFees.add(position.loanToken, accruedDuringPeriod.toString(), METRIC.BORROW_INTEREST);
  });

  const dailyFees = borrowInterestFees.clone();
  dailyFees.add(liquidationProtocolFees);

  const dailyProtocolRevenue = borrowInterestProtocolRevenue.clone();
  dailyProtocolRevenue.add(liquidationProtocolFees);

  const dailySupplySideRevenue = borrowInterestFees.clone();
  dailySupplySideRevenue.subtract(borrowInterestProtocolRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [TRISTERO_MARGIN_CONFIG.chain]: {
      fetch,
      start: TRISTERO_MARGIN_CONFIG.start,
    },
  },
  methodology: {
    Fees: 'Daily borrow interest accrued on open margin positions, plus any protocol-collected liquidation fees.',
    Revenue: 'Protocol share of margin borrow interest and liquidation fees. The current live staging escrow has protocol borrow fees disabled, so this is usually zero until that parameter changes.',
    ProtocolRevenue: 'Protocol share of margin borrow interest and liquidation fees. The current live staging escrow has protocol borrow fees disabled, so this is usually zero until that parameter changes.',
    SupplySideRevenue: 'Borrow interest attributable to the filler lenders that funded margin positions.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Borrow interest accrued during the day across active, closed, and liquidated margin positions.',
      [METRIC.LIQUIDATION_FEES]: 'Protocol-collected liquidation fees.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol share of borrow interest.',
      [METRIC.LIQUIDATION_FEES]: 'Protocol-collected liquidation fees.',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol share of borrow interest.',
      [METRIC.LIQUIDATION_FEES]: 'Protocol-collected liquidation fees.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Borrow interest attributable to the filler lenders that funded margin positions.',
    },
  },
};

export default adapter;
