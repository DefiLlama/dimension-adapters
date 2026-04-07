import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import {
    getActiveTristeroMarginEscrows,
    getPositionIds,
    mulDivCeil,
    normalizePosition,
    toBigIntSafe,
    toPositionId,
    TRISTERO_MARGIN_ABI,
    type TristeroMarginPosition,
    TRISTERO_MARGIN_CONFIGS,
} from "../helpers/tristeroMargin";

type ProtocolFeeLog = {
    token: string;
    amount: bigint;
};

type PositionRef = {
    escrow: string;
    positionId: number;
};

type HistoricalPositionRef = PositionRef & {
    block: number;
};

type PositionEvent = {
    log: any;
    positionRef: PositionRef;
    block: number;
};

function getPositionKey({ escrow, positionId }: PositionRef): string {
    return `${escrow.toLowerCase()}-${positionId}`;
}

function getHistoricalPositionKey({ escrow, positionId, block }: HistoricalPositionRef): string {
    return `${getPositionKey({ escrow, positionId })}-${block}`;
}

function eventKey(log: any): string {
    const escrow = String(log.address ?? "").toLowerCase();
    return `${escrow}-${String(log.transactionHash).toLowerCase()}-${toPositionId(log.args.positionId)}`;
}

function addToPositionMap(map: Map<string, bigint>, positionRef: PositionRef, amount: bigint) {
    const key = getPositionKey(positionRef);
    map.set(key, (map.get(key) ?? 0n) + amount);
}

function flattenGroupedLogs(logGroups: any[][], escrows: string[]): any[] {
    return logGroups.flatMap((logs, index) =>
        logs.map((log: any) => ({ ...log, address: log.address ?? escrows[index] }))
    );
}

function getUniqueHistoricalRefs(positionEvents: PositionEvent[]): HistoricalPositionRef[] {
    const uniqueRefs = new Map<string, HistoricalPositionRef>();

    positionEvents.forEach(({ positionRef, block }) => {
        const ref = { ...positionRef, block };
        uniqueRefs.set(getHistoricalPositionKey(ref), ref);
    });

    return Array.from(uniqueRefs.values());
}

async function getHistoricalPositions(
    options: FetchOptions,
    positionEvents: PositionEvent[],
): Promise<Map<string, TristeroMarginPosition | null>> {
    const positionRefsByBlock = new Map<number, HistoricalPositionRef[]>();

    getUniqueHistoricalRefs(positionEvents).forEach((positionRef) => {
        const refsAtBlock = positionRefsByBlock.get(positionRef.block) ?? [];
        refsAtBlock.push(positionRef);
        positionRefsByBlock.set(positionRef.block, refsAtBlock);
    });

    const positionsByRef = new Map<string, TristeroMarginPosition | null>();

    for (const [block, positionRefs] of positionRefsByBlock.entries()) {
        const positions = await options.api.multiCall({
            abi: TRISTERO_MARGIN_ABI.positions,
            calls: positionRefs.map(({ escrow, positionId }) => ({
                target: escrow,
                params: [positionId],
            })),
            block,
            permitFailure: true,
        });

        positionRefs.forEach((positionRef, index) => {
            positionsByRef.set(getHistoricalPositionKey(positionRef), normalizePosition(positions[index]));
        });
    }

    return positionsByRef;
}

async function getHistoricalAccumulatedInterest(
    options: FetchOptions,
    positionEvents: PositionEvent[],
): Promise<Map<string, bigint>> {
    const positionRefsByBlock = new Map<number, HistoricalPositionRef[]>();

    getUniqueHistoricalRefs(positionEvents).forEach((positionRef) => {
        const refsAtBlock = positionRefsByBlock.get(positionRef.block) ?? [];
        refsAtBlock.push(positionRef);
        positionRefsByBlock.set(positionRef.block, refsAtBlock);
    });

    const interestByRef = new Map<string, bigint>();

    for (const [block, positionRefs] of positionRefsByBlock.entries()) {
        const accumulatedInterest = await options.api.multiCall({
            abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
            calls: positionRefs.map(({ escrow, positionId }) => ({
                target: escrow,
                params: [positionId],
            })),
            block,
            permitFailure: true,
        });

        positionRefs.forEach((positionRef, index) => {
            interestByRef.set(getHistoricalPositionKey(positionRef), toBigIntSafe(accumulatedInterest[index]));
        });
    }

    return interestByRef;
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const borrowInterestFees = options.createBalances();
    const borrowInterestProtocolRevenue = options.createBalances();
    const liquidationProtocolFees = options.createBalances();
    const escrows = getActiveTristeroMarginEscrows(options.chain, options.dateString);

    if (!escrows.length) {
        const dailyFees = borrowInterestFees.clone();
        const dailyProtocolRevenue = borrowInterestProtocolRevenue.clone();

        return {
            dailyFees,
            dailyUserFees: dailyFees.clone(),
            dailyRevenue: dailyProtocolRevenue.clone(),
            dailyProtocolRevenue,
            dailySupplySideRevenue: borrowInterestFees.clone(),
        };
    }

    const realizedBorrowInterestByPosition = new Map<string, bigint>();
    const knownPositions = new Map<string, TristeroMarginPosition>();
    const relevantPositions = new Map<string, PositionRef>();

    const [closeLogsWithGroups, liquidationLogsWithGroups, protocolFeeLogsWithGroups] = await Promise.all([
        options.getLogs({
            targets: escrows,
            eventAbi: TRISTERO_MARGIN_ABI.positionClosed,
            entireLog: true,
            parseLog: true,
            flatten: false,
        }),
        options.getLogs({
            targets: escrows,
            eventAbi: TRISTERO_MARGIN_ABI.positionLiquidated,
            entireLog: true,
            parseLog: true,
            flatten: false,
        }),
        options.getLogs({
            targets: escrows,
            eventAbi: TRISTERO_MARGIN_ABI.protocolFeeCollected,
            entireLog: true,
            parseLog: true,
            flatten: false,
        }),
    ]);

    const closeLogs = flattenGroupedLogs(closeLogsWithGroups as any[][], escrows);
    const liquidationLogs = flattenGroupedLogs(liquidationLogsWithGroups as any[][], escrows);
    const protocolFeeLogs = flattenGroupedLogs(protocolFeeLogsWithGroups as any[][], escrows);

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

    const closeEvents: PositionEvent[] = closeLogs.flatMap((log: any) => {
        const escrow = String(log.address).toLowerCase();
        const positionId = toPositionId(log.args.positionId);
        const positionRef = { escrow, positionId };
        relevantPositions.set(getPositionKey(positionRef), positionRef);

        const block = Number(log.blockNumber) - 1;
        return block >= 0 ? [{ log, positionRef, block }] : [];
    });

    const liquidationEvents: PositionEvent[] = liquidationLogs.flatMap((log: any) => {
        const escrow = String(log.address).toLowerCase();
        const positionId = toPositionId(log.args.positionId);
        const positionRef = { escrow, positionId };
        relevantPositions.set(getPositionKey(positionRef), positionRef);

        const block = Number(log.blockNumber) - 1;
        return block >= 0 ? [{ log, positionRef, block }] : [];
    });

    const historicalPositions = await getHistoricalPositions(options, [...closeEvents, ...liquidationEvents]);
    const historicalAccruedInterest = await getHistoricalAccumulatedInterest(options, liquidationEvents);

    closeEvents.forEach(({ log, positionRef, block }) => {
        const prePosition = historicalPositions.get(getHistoricalPositionKey({ ...positionRef, block }));
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
    });

    liquidationEvents.forEach(({ log, positionRef, block }) => {
        const prePosition = historicalPositions.get(getHistoricalPositionKey({ ...positionRef, block }));
        if (!prePosition) return;

        knownPositions.set(getPositionKey(positionRef), prePosition);

        const preAccruedInterest = historicalAccruedInterest.get(getHistoricalPositionKey({ ...positionRef, block })) ?? 0n;
        if (preAccruedInterest > 0n) {
            addToPositionMap(realizedBorrowInterestByPosition, positionRef, preAccruedInterest);
        }

        const liquidationFees = (protocolFeesByEvent.get(eventKey(log)) ?? [])
            .filter((fee) => fee.token === prePosition.token.toLowerCase())
            .reduce((sum, fee) => sum + fee.amount, 0n);

        if (liquidationFees > 0n) {
            liquidationProtocolFees.add(prePosition.token, liquidationFees.toString(), METRIC.LIQUIDATION_FEES);
        }
    });

    const totalPositionsPerEscrow = await options.toApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.totalPositions,
        calls: escrows.map((escrow) => ({ target: escrow })),
        permitFailure: true,
    });

    const endPositionRefs = totalPositionsPerEscrow.flatMap((totalPositions, index) =>
        getPositionIds(totalPositions).map((positionId) => ({
            escrow: escrows[index],
            positionId,
        }))
    );

    const endPositionsRaw = endPositionRefs.length
        ? await options.toApi.multiCall({
            abi: TRISTERO_MARGIN_ABI.positions,
            calls: endPositionRefs.map(({ escrow, positionId }) => ({
                target: escrow,
                params: [positionId],
            })),
            permitFailure: true,
        })
        : [];

    endPositionsRaw.forEach((position: any, index: number) => {
        const normalized = normalizePosition(position);
        if (!normalized || normalized.size === 0n) return;

        const positionRef = { escrow: endPositionRefs[index].escrow.toLowerCase(), positionId: endPositionRefs[index].positionId };
        relevantPositions.set(getPositionKey(positionRef), positionRef);
        knownPositions.set(getPositionKey(positionRef), normalized);
    });

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
    adapter: TRISTERO_MARGIN_CONFIGS,
    fetch,
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
