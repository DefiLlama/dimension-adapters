import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import {
  getActiveTristeroMarginEscrows,
  getAccumulatedInterestAtBlock,
  getPositionAtBlock,
  getPositionIds,
  getTristeroMarginChainStart,
  getTristeroMarginChains,
  mulDivCeil,
  normalizePosition,
  toBigIntSafe,
  toPositionId,
  TRISTERO_MARGIN_ABI,
  type TristeroMarginPosition,
} from "../helpers/tristeroMargin";

type ProtocolFeeLog = {
  token: string;
  amount: bigint;
};

type PositionRef = {
  escrow: string;
  positionId: number;
};

function getPositionKey({ escrow, positionId }: PositionRef): string {
  return `${escrow.toLowerCase()}-${positionId}`;
}

function eventKey(log: any): string {
  const escrow = String(log.address ?? "").toLowerCase();
  return `${escrow}-${String(log.transactionHash).toLowerCase()}-${toPositionId(log.args.positionId)}`;
}

function addToPositionMap(map: Map<string, bigint>, positionRef: PositionRef, amount: bigint) {
  const key = getPositionKey(positionRef);
  map.set(key, (map.get(key) ?? 0n) + amount);
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const borrowInterestFees = options.createBalances();
  const borrowInterestProtocolRevenue = options.createBalances();
  const liquidationProtocolFees = options.createBalances();
  const escrows = getActiveTristeroMarginEscrows(options.chain, options.dateString);

  if (!escrows.length) {
    return {
      dailyFees: borrowInterestFees,
      dailyUserFees: borrowInterestFees.clone(),
      dailyRevenue: borrowInterestProtocolRevenue.clone(),
      dailyProtocolRevenue: borrowInterestProtocolRevenue,
      dailySupplySideRevenue: borrowInterestFees.clone(),
    };
  }

  const realizedBorrowInterestByPosition = new Map<string, bigint>();
  const knownPositions = new Map<string, TristeroMarginPosition>();
  const relevantPositions = new Map<string, PositionRef>();

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);

  const logGroups = await Promise.all(
    escrows.map(async (escrow) => {
      const [closeLogs, liquidationLogs, protocolFeeLogs] = await Promise.all([
        options.getLogs({
          target: escrow,
          eventAbi: TRISTERO_MARGIN_ABI.positionClosed,
          fromBlock,
          toBlock,
          entireLog: true,
          parseLog: true,
        }),
        options.getLogs({
          target: escrow,
          eventAbi: TRISTERO_MARGIN_ABI.positionLiquidated,
          fromBlock,
          toBlock,
          entireLog: true,
          parseLog: true,
        }),
        options.getLogs({
          target: escrow,
          eventAbi: TRISTERO_MARGIN_ABI.protocolFeeCollected,
          fromBlock,
          toBlock,
          entireLog: true,
          parseLog: true,
        }),
      ]);

      return {
        closeLogs: closeLogs.map((log: any) => ({ ...log, address: log.address ?? escrow })),
        liquidationLogs: liquidationLogs.map((log: any) => ({ ...log, address: log.address ?? escrow })),
        protocolFeeLogs: protocolFeeLogs.map((log: any) => ({ ...log, address: log.address ?? escrow })),
      };
    })
  );

  const closeLogs = logGroups.flatMap(({ closeLogs }) => closeLogs);
  const liquidationLogs = logGroups.flatMap(({ liquidationLogs }) => liquidationLogs);
  const protocolFeeLogs = logGroups.flatMap(({ protocolFeeLogs }) => protocolFeeLogs);

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
    const escrow = String(log.address).toLowerCase();
    const positionId = toPositionId(log.args.positionId);
    const positionRef = { escrow, positionId };
    relevantPositions.set(getPositionKey(positionRef), positionRef);

    const block = Number(log.blockNumber) - 1;
    if (block < 0) return;

    const prePosition = await getPositionAtBlock(options, escrow, positionId, block);
    if (!prePosition || prePosition.size === 0n) return;

    knownPositions.set(getPositionKey(positionRef), prePosition);

    const protocolFees = (protocolFeesByEvent.get(eventKey(log)) ?? [])
      .filter((fee) => fee.token === prePosition.loanToken.toLowerCase())
      .reduce((sum, fee) => sum + fee.amount, 0n);

    const closedSize = toBigIntSafe(log.args.closedSize);
    if (closedSize === 0n) return;

    const principalClosed = mulDivCeil(prePosition.loanAmount, closedSize, prePosition.size);
    const repaidDebt = toBigIntSafe(log.args.loanerRepayment) + protocolFees;
    const realizedInterest = repaidDebt > principalClosed ? repaidDebt - principalClosed : 0n;

    if (realizedInterest > 0n) {
      addToPositionMap(realizedBorrowInterestByPosition, positionRef, realizedInterest);
    }

    if (protocolFees > 0n) {
      borrowInterestProtocolRevenue.add(prePosition.loanToken, protocolFees.toString(), METRIC.BORROW_INTEREST);
    }
  }));

  await Promise.all(liquidationLogs.map(async (log: any) => {
    const escrow = String(log.address).toLowerCase();
    const positionId = toPositionId(log.args.positionId);
    const positionRef = { escrow, positionId };
    relevantPositions.set(getPositionKey(positionRef), positionRef);

    const block = Number(log.blockNumber) - 1;
    if (block < 0) return;

    const [prePosition, preAccruedInterest] = await Promise.all([
      getPositionAtBlock(options, escrow, positionId, block),
      getAccumulatedInterestAtBlock(options, escrow, positionId, block),
    ]);
    if (!prePosition) return;

    knownPositions.set(getPositionKey(positionRef), prePosition);

    if (preAccruedInterest > 0n) {
      addToPositionMap(realizedBorrowInterestByPosition, positionRef, preAccruedInterest);
    }

    const liquidationFees = (protocolFeesByEvent.get(eventKey(log)) ?? [])
      .filter((fee) => fee.token === prePosition.token.toLowerCase())
      .reduce((sum, fee) => sum + fee.amount, 0n);

    if (liquidationFees > 0n) {
      liquidationProtocolFees.add(prePosition.token, liquidationFees.toString(), METRIC.LIQUIDATION_FEES);
    }
  }));

  const totalPositionsPerEscrow = await options.toApi.multiCall({
    abi: TRISTERO_MARGIN_ABI.totalPositions,
    calls: escrows.map((escrow) => ({ target: escrow })),
    permitFailure: true,
  });

  await Promise.all(
    escrows.map(async (escrow, index) => {
      const positionIds = getPositionIds(totalPositionsPerEscrow[index]);
      if (!positionIds.length) return;

      const endPositionsRaw = await options.toApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.positions,
        calls: positionIds.map((positionId) => ({
          target: escrow,
          params: [positionId],
        })),
        permitFailure: true,
      });

      endPositionsRaw.forEach((position: any, positionIndex: number) => {
        const normalized = normalizePosition(position);
        if (!normalized || normalized.size === 0n) return;

        const positionRef = { escrow: escrow.toLowerCase(), positionId: positionIds[positionIndex] };
        relevantPositions.set(getPositionKey(positionRef), positionRef);
        knownPositions.set(getPositionKey(positionRef), normalized);
      });
    })
  );

  const trackedPositions = Array.from(relevantPositions.values());
  const [startAccruedRaw, endAccruedRaw] = trackedPositions.length
    ? await Promise.all([
      options.fromApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
        calls: trackedPositions.map(({ escrow, positionId }) => ({
          target: escrow,
          params: [positionId],
        })),
        permitFailure: true,
      }),
      options.toApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
        calls: trackedPositions.map(({ escrow, positionId }) => ({
          target: escrow,
          params: [positionId],
        })),
        permitFailure: true,
      }),
    ])
    : [[], []];

  trackedPositions.forEach((positionRef, index) => {
    const positionKey = getPositionKey(positionRef);
    const position = knownPositions.get(positionKey);
    if (!position) return;

    const startAccrued = toBigIntSafe(startAccruedRaw[index]);
    const endAccrued = toBigIntSafe(endAccruedRaw[index]);
    const realizedInterest = realizedBorrowInterestByPosition.get(positionKey) ?? 0n;

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
  adapter: Object.fromEntries(
    getTristeroMarginChains().map((chain) => [
      chain,
      {
        fetch,
        start: getTristeroMarginChainStart(chain)!,
      },
    ])
  ),
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
