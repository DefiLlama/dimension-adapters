import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import {
    getActiveTristeroMarginEscrows,
    getPositionIds,
    mulDivCeil,
    normalizePosition,
    toBigIntOrNull,
    toBigIntSafe,
    toPositionId,
    TRISTERO_MARGIN_ABI,
    type TristeroMarginPosition,
    TRISTERO_MARGIN_CONFIGS,
} from "../helpers/tristeroMargin";

const MARGIN_METRICS = {
    BORROW_INTEREST_TO_PROTOCOL: 'Borrow Interest To Protocol',
    BORROW_INTEREST_TO_LENDERS: 'Borrow Interest To Lenders',
    LIQUIDATION_FEES_TO_PROTOCOL: 'Liquidation Fees To Protocol',
} as const;

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

function eventKey(log: any): string | null {
    const escrow = String(log?.address ?? "").toLowerCase();
    const txHash = log?.transactionHash ? String(log.transactionHash).toLowerCase() : "";
    const positionId = log?.args?.positionId;
    if (!escrow || !txHash || positionId === null || positionId === undefined) return null;

    return `${escrow}-${txHash}-${toPositionId(positionId)}`;
}

function addToPositionMap(map: Map<string, bigint>, positionRef: PositionRef, amount: bigint) {
    const key = getPositionKey(positionRef);
    map.set(key, (map.get(key) ?? 0n) + amount);
}

function addToTokenMap(map: Map<string, bigint>, token: string, amount: bigint) {
    const key = token.toLowerCase();
    map.set(key, (map.get(key) ?? 0n) + amount);
}

function flattenGroupedLogs(logGroups: any[][], escrows: string[]): any[] {
    return logGroups.flatMap((logs, index) =>
        logs.map((log: any) => ({ ...log, address: log.address ?? escrows[index] }))
    );
}

function toPositionEvent(log: any): PositionEvent | null {
    const escrow = String(log?.address ?? "").toLowerCase();
    const positionId = log?.args?.positionId;
    const blockNumber = log?.blockNumber;
    if (!escrow || positionId === null || positionId === undefined || blockNumber === null || blockNumber === undefined) return null;

    const block = Number(blockNumber) - 1;
    if (block < 0) return null;

    return {
        log,
        positionRef: { escrow, positionId: toPositionId(positionId) },
        block,
    };
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
): Promise<Map<string, bigint | null>> {
    const positionRefsByBlock = new Map<number, HistoricalPositionRef[]>();

    getUniqueHistoricalRefs(positionEvents).forEach((positionRef) => {
        const refsAtBlock = positionRefsByBlock.get(positionRef.block) ?? [];
        refsAtBlock.push(positionRef);
        positionRefsByBlock.set(positionRef.block, refsAtBlock);
    });

    const interestByRef = new Map<string, bigint | null>();

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
            interestByRef.set(getHistoricalPositionKey(positionRef), toBigIntOrNull(accumulatedInterest[index]));
        });
    }

    return interestByRef;
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const borrowInterestFees = options.createBalances();
    const borrowInterestProtocolRevenue = options.createBalances();
    const borrowInterestSupplySideRevenue = options.createBalances();
    const liquidationFees = options.createBalances();
    const liquidationProtocolRevenue = options.createBalances();
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
    const grossBorrowInterestByToken = new Map<string, bigint>();
    const protocolBorrowInterestByToken = new Map<string, bigint>();
    const liquidationProtocolFeesByToken = new Map<string, bigint>();

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
        if (!key || log?.args?.token === undefined || log?.args?.amount === undefined) return;
        const logs = protocolFeesByEvent.get(key) ?? [];
        logs.push({
            token: String(log.args.token).toLowerCase(),
            amount: toBigIntSafe(log.args.amount),
        });
        protocolFeesByEvent.set(key, logs);
    });

    const closeEvents: PositionEvent[] = closeLogs.flatMap((log: any) => {
        const event = toPositionEvent(log);
        if (!event) return [];

        relevantPositions.set(getPositionKey(event.positionRef), event.positionRef);
        return [event];
    });

    const liquidationEvents: PositionEvent[] = liquidationLogs.flatMap((log: any) => {
        const event = toPositionEvent(log);
        if (!event) return [];

        relevantPositions.set(getPositionKey(event.positionRef), event.positionRef);
        return [event];
    });

    const historicalPositions = await getHistoricalPositions(options, [...closeEvents, ...liquidationEvents]);
    const historicalAccruedInterest = await getHistoricalAccumulatedInterest(options, liquidationEvents);

    closeEvents.forEach(({ log, positionRef, block }) => {
        const prePosition = historicalPositions.get(getHistoricalPositionKey({ ...positionRef, block }));
        if (!prePosition || prePosition.size === 0n) return;

        knownPositions.set(getPositionKey(positionRef), prePosition);

        const closeEventKey = eventKey(log);
        const protocolFees = ((closeEventKey ? protocolFeesByEvent.get(closeEventKey) : []) ?? [])
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
            addToTokenMap(protocolBorrowInterestByToken, prePosition.loanToken, protocolFees);
        }
    });

    liquidationEvents.forEach(({ log, positionRef, block }) => {
        const prePosition = historicalPositions.get(getHistoricalPositionKey({ ...positionRef, block }));
        if (!prePosition) return;

        knownPositions.set(getPositionKey(positionRef), prePosition);

        const preAccruedInterest = historicalAccruedInterest.get(getHistoricalPositionKey({ ...positionRef, block }));
        if (preAccruedInterest === null || preAccruedInterest === undefined) return;

        if (preAccruedInterest > 0n) {
            addToPositionMap(realizedBorrowInterestByPosition, positionRef, preAccruedInterest);
        }

        const liquidationEventKey = eventKey(log);
        const liquidationFeeAmount = ((liquidationEventKey ? protocolFeesByEvent.get(liquidationEventKey) : []) ?? [])
            .filter((fee) => fee.token === prePosition.token.toLowerCase())
            .reduce((sum, fee) => sum + fee.amount, 0n);

        if (liquidationFeeAmount > 0n) {
            addToTokenMap(liquidationProtocolFeesByToken, prePosition.token, liquidationFeeAmount);
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

        const startAccrued = toBigIntOrNull(startAccruedRaw[index]);
        const endAccrued = toBigIntOrNull(endAccruedRaw[index]);
        if (startAccrued === null || endAccrued === null) return;

        const realizedInterest = realizedBorrowInterestByPosition.get(positionKey) ?? 0n;

        const accruedDuringPeriod = realizedInterest + endAccrued - startAccrued;
        if (accruedDuringPeriod <= 0n) return;

        addToTokenMap(grossBorrowInterestByToken, position.loanToken, accruedDuringPeriod);
        borrowInterestFees.add(position.loanToken, accruedDuringPeriod.toString(), METRIC.BORROW_INTEREST);
    });

    protocolBorrowInterestByToken.forEach((amount, token) => {
        borrowInterestProtocolRevenue.add(token, amount.toString(), MARGIN_METRICS.BORROW_INTEREST_TO_PROTOCOL);
    });

    liquidationProtocolFeesByToken.forEach((amount, token) => {
        liquidationFees.add(token, amount.toString(), METRIC.LIQUIDATION_FEES);
        liquidationProtocolRevenue.add(token, amount.toString(), MARGIN_METRICS.LIQUIDATION_FEES_TO_PROTOCOL);
    });

    grossBorrowInterestByToken.forEach((grossAmount, token) => {
        const supplySideAmount = grossAmount - (protocolBorrowInterestByToken.get(token) ?? 0n);
        if (supplySideAmount <= 0n) return;

        borrowInterestSupplySideRevenue.add(token, supplySideAmount.toString(), MARGIN_METRICS.BORROW_INTEREST_TO_LENDERS);
    });

    const dailyFees = borrowInterestFees.clone();
    dailyFees.add(liquidationFees);

    const dailyProtocolRevenue = borrowInterestProtocolRevenue.clone();
    dailyProtocolRevenue.add(liquidationProtocolRevenue);

    const dailySupplySideRevenue = borrowInterestSupplySideRevenue.clone();

    return {
        dailyFees,
        dailyUserFees: dailyFees.clone(),
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: 'Daily borrow interest accrued on open margin positions, plus any protocol-collected liquidation fees.',
    Revenue: 'Protocol share of margin borrow interest and liquidation fees. The current live staging escrow has protocol borrow fees disabled, so this is usually zero until that parameter changes.',
    ProtocolRevenue: 'Protocol share of margin borrow interest and liquidation fees. The current live staging escrow has protocol borrow fees disabled, so this is usually zero until that parameter changes.',
    SupplySideRevenue: 'Borrow interest attributable to the filler lenders that funded margin positions.',
};

const breakdownMethodology = {
    Fees: {
        [METRIC.BORROW_INTEREST]: 'Borrow interest accrued during the day across active, closed, and liquidated margin positions.',
        [METRIC.LIQUIDATION_FEES]: 'Protocol-collected liquidation fees.',
    },
    Revenue: {
        [MARGIN_METRICS.BORROW_INTEREST_TO_PROTOCOL]: 'Protocol share of borrow interest.',
        [MARGIN_METRICS.LIQUIDATION_FEES_TO_PROTOCOL]: 'Protocol-collected liquidation fees.',
    },

    ProtocolRevenue: {
        [MARGIN_METRICS.BORROW_INTEREST_TO_PROTOCOL]: 'Protocol share of borrow interest.',
        [MARGIN_METRICS.LIQUIDATION_FEES_TO_PROTOCOL]: 'Protocol-collected liquidation fees.',
    },
    SupplySideRevenue: {
        [MARGIN_METRICS.BORROW_INTEREST_TO_LENDERS]: 'Borrow interest attributable to the filler lenders that funded margin positions.',
    },
};
const adapter: SimpleAdapter = {
    version: 2,
    adapter: TRISTERO_MARGIN_CONFIGS,
    fetch,
    pullHourly: true,
    methodology,
    breakdownMethodology,
};

export default adapter;
