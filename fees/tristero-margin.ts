import * as sdk from "@defillama/sdk";
import retry from "async-retry";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import getTxReceipts from "../helpers/getTxReceipts";
import { METRIC } from "../helpers/metrics";
import { httpPost } from "../utils/fetchURL";
import {
    getActiveTristeroMarginEscrows,
    getActiveTristeroV3MarginEscrows,
    getTristeroMarginChainStart,
    getTristeroMarginChains,
    getTristeroV3MarginPositions,
    getTristeroV3MarginPositionSnapshots,
    getTristeroV3MarginReductions,
    getV3PositionKey,
    getPositionIds,
    mulDivCeil,
    normalizePosition,
    toBigIntOrNull,
    toBigIntSafe,
    toPositionId,
    TRISTERO_MARGIN_ABI,
    TRISTERO_V3_MARGIN_ABI,
    type TristeroMarginPosition,
    type TristeroV3MarginPosition,
} from "../helpers/tristeroMargin";

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const V3_RECEIPT_RPC_FALLBACKS: Record<string, string[]> = {
    base: ["https://mainnet.base.org"],
};

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

function normalizeAddress(value?: string | null): string {
    return value?.toLowerCase() ?? "";
}

function topicAddress(address: string): string {
    return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function topicToAddress(topic?: string): string {
    return topic ? `0x${topic.slice(-40)}`.toLowerCase() : "";
}

function isNonZeroBytes32(value?: string): boolean {
    if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) return false;
    return BigInt(value) > 0n;
}

function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function formatV3ReadValueContext(positions: TristeroV3MarginPosition[]): string {
    return positions
        .slice(0, 3)
        .map((position) => `${position.vault}/${position.loanAsset}/${position.loanShares.toString()}`)
        .join(", ");
}

type PermitFailureMultiCallParams = {
    abi: string;
    calls: Array<{ target?: string; params?: any }>;
    target?: string;
    block?: number;
};

async function permitFailureMultiCallWithFallback(
    options: FetchOptions,
    api: any,
    params: PermitFailureMultiCallParams,
    context: string,
): Promise<any[]> {
    try {
        return await api.multiCall({ ...params, permitFailure: true });
    } catch (error) {
        sdk.log(`Tristero multicall failed on ${options.chain} ${context}: ${formatErrorMessage(error)}`);
    }

    const block = params.block ?? api.block;
    return Promise.all(params.calls.map(async (call, index) => {
        const target = call.target ?? params.target;
        if (!target) {
            sdk.log(`Tristero multicall fallback missing target on ${options.chain} ${context} call ${index}`);
            return null;
        }

        try {
            const output = await api.call({
                target,
                abi: params.abi,
                params: call.params,
                block,
                permitFailure: true,
            });
            return output && typeof output === "object" && "output" in output ? output.output : output;
        } catch (error) {
            sdk.log(`Tristero multicall fallback failed on ${options.chain} ${context} call ${index} target ${target}: ${formatErrorMessage(error)}`);
            return null;
        }
    }));
}

async function readV3LoanValuesAtBlock(
    options: FetchOptions,
    positions: TristeroV3MarginPosition[],
    block: number,
): Promise<Map<string, bigint>> {
    let values: any[] = [];
    if (positions.length) {
        try {
            values = await permitFailureMultiCallWithFallback(options, options.api, {
                abi: TRISTERO_V3_MARGIN_ABI.readValue,
                calls: positions.map((position) => ({
                    target: position.vault,
                    params: [position.loanAsset, position.loanShares.toString()],
                })),
                block,
            }, `readValue block ${block} for ${positions.length} positions (${formatV3ReadValueContext(positions)})`);
        } catch (error) {
            sdk.log(`Tristero v3 multicall readValue failed on ${options.chain} at block ${block} for ${positions.length} positions (${formatV3ReadValueContext(positions)}): ${formatErrorMessage(error)}`);
            values = [];
        }
    }

    const valuesByPosition = new Map<string, bigint>();
    for (const [index, position] of positions.entries()) {
        let value = toBigIntOrNull(values[index]);
        if (value === null) {
            value = await readV3LoanValueAtBlock(options, position, block);
        }
        if (value === null) {
            throw new Error(`Unable to read Tristero v3 loan value for ${options.chain} position ${position.positionId} at ${position.escrow} block ${block}`);
        }

        valuesByPosition.set(getV3PositionKey(position), value);
    }

    return valuesByPosition;
}

async function readV3LoanValueAtBlock(
    options: FetchOptions,
    position: TristeroV3MarginPosition,
    block: number,
): Promise<bigint | null> {
    try {
        return await retry(async () => {
            const { output } = await sdk.api.abi.call({
                chain: options.chain,
                block,
                target: position.vault,
                abi: TRISTERO_V3_MARGIN_ABI.readValue,
                params: [position.loanAsset, position.loanShares.toString()],
            });

            const value = toBigIntOrNull(output);
            if (value === null) throw new Error("readValue returned nullish output");
            return value;
        }, {
            retries: 2,
            minTimeout: 500,
            onRetry: (error, attempt) => {
                sdk.log(`Retrying Tristero v3 single readValue on ${options.chain} position ${position.positionId} at ${position.escrow} block ${block} (attempt ${attempt + 1}): ${formatErrorMessage(error)}`);
            },
        });
    } catch (error) {
        sdk.log(`Tristero v3 single readValue failed on ${options.chain} position ${position.positionId} at ${position.escrow} block ${block}: ${formatErrorMessage(error)}`);
        return null;
    }
}

async function readV3LoanValuesByPositionBlock(
    options: FetchOptions,
    positionBlocks: { position: TristeroV3MarginPosition; block: number }[],
): Promise<Map<string, bigint>> {
    const positionsByBlock = new Map<number, TristeroV3MarginPosition[]>();

    positionBlocks.forEach(({ position, block }) => {
        const positions = positionsByBlock.get(block) ?? [];
        positions.push(position);
        positionsByBlock.set(block, positions);
    });

    const valuesByPosition = new Map<string, bigint>();
    for (const [block, positions] of positionsByBlock.entries()) {
        const valuesAtBlock = await readV3LoanValuesAtBlock(options, positions, block);
        valuesAtBlock.forEach((value, key) => valuesByPosition.set(`${key}-${block}`, value));
    }

    return valuesByPosition;
}

function getV3HistoricalValueKey(position: { escrow: string; positionId: number }, block: number): string {
    return `${getV3PositionKey(position)}-${block}`;
}

function getV3ReductionRepayments(
    reductions: Awaited<ReturnType<typeof getTristeroV3MarginReductions>>,
    startBlockByPosition: Map<string, number>,
    toBlock: number,
): Map<string, bigint> {
    const repayments = new Map<string, bigint>();

    reductions.forEach((reduction) => {
        const positionKey = getV3PositionKey(reduction);
        const startBlock = startBlockByPosition.get(positionKey);
        if (startBlock === undefined) return;
        if (reduction.blockNumber <= startBlock || reduction.blockNumber > toBlock) return;

        repayments.set(positionKey, (repayments.get(positionKey) ?? 0n) + reduction.repayAmount);
    });

    return repayments;
}

async function getV3CloseRepayments(
    options: FetchOptions,
    closedPositions: TristeroV3MarginPosition[],
): Promise<Map<string, bigint>> {
    const txHashes = [...new Set(closedPositions.map((position) => position.closeTxHash).filter((txHash): txHash is string => !!txHash))];
    const repaymentByPosition = new Map<string, bigint>();
    if (!txHashes.length) return repaymentByPosition;

    const receipts = await getTxReceipts(options.chain, txHashes, {
        cacheKey: "tristero-v3-margin-close-fees",
    });
    const positionsByTxHash = new Map<string, TristeroV3MarginPosition[]>();
    closedPositions.forEach((position) => {
        if (!position.closeTxHash) return;
        const txHash = position.closeTxHash.toLowerCase();
        const positions = positionsByTxHash.get(txHash) ?? [];
        positions.push(position);
        positionsByTxHash.set(txHash, positions);
    });

    for (const [index, cachedReceipt] of receipts.entries()) {
        const requestedTxHash = normalizeAddress(txHashes[index]);
        const receipt = cachedReceipt ?? await getV3CloseReceipt(options.chain, requestedTxHash);
        if (!receipt) {
            const affectedPositions = (positionsByTxHash.get(requestedTxHash) ?? [])
                .map(getV3PositionKey)
                .join(", ") || "none";
            throw new Error(`Missing Tristero v3 close receipt for ${options.chain} tx ${requestedTxHash}; affected positions: ${affectedPositions}`);
        }

        const txHash = normalizeAddress(receipt.transactionHash ?? receipt.hash);
        if (!txHash) {
            throw new Error(`Missing Tristero v3 close receipt transaction hash for ${options.chain} tx ${requestedTxHash}`);
        }

        const positions = positionsByTxHash.get(txHash);
        if (!positions?.length) continue;
        if (positions.length !== 1) {
            throw new Error(`Ambiguous Tristero v3 close repayment attribution for ${options.chain} tx ${txHash}: ${positions.length} positions share one receipt`);
        }

        const position = positions[0];
        if (!normalizeAddress(position.closeFiller)) {
            throw new Error(`Missing Tristero v3 close filler for ${options.chain} position ${position.positionId} at ${position.escrow} tx ${txHash}`);
        }

        let repayment = 0n;
        (receipt.logs ?? []).forEach((log: any) => {
            const topics = log.topics ?? [];
            if (
                normalizeAddress(log.address) !== position.loanAsset
                || topics.length !== 3
                || normalizeAddress(topics[0]) !== ERC20_TRANSFER_TOPIC
                || normalizeAddress(topics[1]) !== topicAddress(position.escrow)
                || topicToAddress(topics[2]) !== normalizeAddress(position.closeFiller)
                || !isNonZeroBytes32(log.data)
            ) {
                return;
            }

            repayment += BigInt(log.data);
        });

        repaymentByPosition.set(getV3PositionKey(position), repayment);
    }

    return repaymentByPosition;
}

async function getV3CloseReceipt(chain: string, txHash: string): Promise<any | null> {
    for (const rpcUrl of V3_RECEIPT_RPC_FALLBACKS[chain] ?? []) {
        try {
            const payload = await httpPost(rpcUrl, {
                jsonrpc: "2.0",
                id: 1,
                method: "eth_getTransactionReceipt",
                params: [txHash],
            });
            if (payload?.result) return payload.result;
        } catch (error) {
            sdk.log(`Tristero v3 fallback RPC ${rpcUrl} failed for ${txHash}: ${(error as Error).message}`);
        }
    }

    return null;
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
        const positions = await permitFailureMultiCallWithFallback(options, options.api, {
            abi: TRISTERO_MARGIN_ABI.positions,
            calls: positionRefs.map(({ escrow, positionId }) => ({
                target: escrow,
                params: [positionId],
            })),
            block,
        }, `legacy positions block ${block} for ${positionRefs.length} refs`);

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
        const accumulatedInterest = await permitFailureMultiCallWithFallback(options, options.api, {
            abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
            calls: positionRefs.map(({ escrow, positionId }) => ({
                target: escrow,
                params: [positionId],
            })),
            block,
        }, `legacy accumulatedInterest block ${block} for ${positionRefs.length} refs`);

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
    const v3Escrows = getActiveTristeroV3MarginEscrows(options.chain, options.dateString);

    if (!escrows.length && !v3Escrows.length) {
        const dailyFees = borrowInterestFees.clone();
        const dailyProtocolRevenue = borrowInterestProtocolRevenue.clone();

        return {
            dailyFees,
            dailyUserFees: dailyFees.clone(),
            dailyRevenue: dailyProtocolRevenue.clone(),
            dailyProtocolRevenue,
            dailySupplySideRevenue: borrowInterestSupplySideRevenue.clone(),
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

    const totalPositionsPerEscrow = await permitFailureMultiCallWithFallback(options, options.toApi, {
        abi: TRISTERO_MARGIN_ABI.totalPositions,
        calls: escrows.map((escrow) => ({ target: escrow })),
    }, `legacy totalPositions for ${escrows.length} escrows`);

    const endPositionRefs = totalPositionsPerEscrow.flatMap((totalPositions, index) =>
        getPositionIds(totalPositions).map((positionId) => ({
            escrow: escrows[index],
            positionId,
        }))
    );

    const endPositionsRaw = endPositionRefs.length
        ? await permitFailureMultiCallWithFallback(options, options.toApi, {
            abi: TRISTERO_MARGIN_ABI.positions,
            calls: endPositionRefs.map(({ escrow, positionId }) => ({
                target: escrow,
                params: [positionId],
            })),
        }, `legacy end positions for ${endPositionRefs.length} refs`)
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
            permitFailureMultiCallWithFallback(options, options.fromApi, {
                abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
                calls: trackedPositions.map(({ escrow, positionId }) => ({
                    target: escrow,
                    params: [positionId],
                })),
            }, `legacy start accumulatedInterest for ${trackedPositions.length} refs`),
            permitFailureMultiCallWithFallback(options, options.toApi, {
                abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
                calls: trackedPositions.map(({ escrow, positionId }) => ({
                    target: escrow,
                    params: [positionId],
                })),
            }, `legacy end accumulatedInterest for ${trackedPositions.length} refs`),
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

    if (v3Escrows.length) {
        const fromBlock = await options.getFromBlock();
        const toBlock = await options.getToBlock();
        const v3Positions = await getTristeroV3MarginPositions(options, v3Escrows, toBlock);
        const relevantV3Positions = v3Positions.filter((position) =>
            position.openBlock <= toBlock
            && (position.closeBlock === undefined || position.closeBlock >= fromBlock)
        );

        const startBlockByPosition = new Map<string, number>();
        relevantV3Positions.forEach((position) => {
            startBlockByPosition.set(
                getV3PositionKey(position),
                position.openBlock > fromBlock ? position.openBlock : fromBlock,
            );
        });
        const startBlocks = relevantV3Positions.map((position) => ({
            position,
            block: startBlockByPosition.get(getV3PositionKey(position))!,
        }));
        const startSnapshots = await getTristeroV3MarginPositionSnapshots(
            options,
            v3Escrows,
            startBlocks.map(({ position, block }) => ({
                escrow: position.escrow,
                positionId: position.positionId,
                block,
            })),
        );
        const startSnapshotByPositionBlock = new Map<string, TristeroV3MarginPosition>();
        startSnapshots.forEach(({ position, block }) => {
            startSnapshotByPositionBlock.set(getV3HistoricalValueKey(position, block), position);
        });
        const startPositionBlocks = startBlocks.map(({ position, block }) => {
            const snapshot = startSnapshotByPositionBlock.get(getV3HistoricalValueKey(position, block));
            if (!snapshot) {
                throw new Error(`Missing Tristero v3 start position snapshot for ${options.chain} position ${position.positionId} at ${position.escrow} block ${block}`);
            }

            return { position: snapshot, block };
        });
        const closedV3Positions = relevantV3Positions.filter((position) =>
            position.closeBlock !== undefined
            && position.closeBlock >= fromBlock
            && position.closeBlock <= toBlock
        );
        const openV3Positions = relevantV3Positions.filter((position) =>
            position.closeBlock === undefined || position.closeBlock > toBlock
        );

        const [startLoanValues, endLoanValues, closeRepayments, reductions] = await Promise.all([
            readV3LoanValuesByPositionBlock(options, startPositionBlocks),
            readV3LoanValuesAtBlock(options, openV3Positions, toBlock),
            getV3CloseRepayments(options, closedV3Positions),
            getTristeroV3MarginReductions(options, v3Escrows, fromBlock, toBlock),
        ]);
        const reductionRepayments = getV3ReductionRepayments(reductions, startBlockByPosition, toBlock);

        relevantV3Positions.forEach((position) => {
            const startBlock = startBlockByPosition.get(getV3PositionKey(position));
            if (startBlock === undefined) {
                throw new Error(`Missing Tristero v3 start block for ${options.chain} position ${position.positionId} at ${position.escrow}`);
            }

            const startValue = startLoanValues.get(getV3HistoricalValueKey(position, startBlock));
            if (startValue === undefined) {
                throw new Error(`Missing Tristero v3 start loan value for ${options.chain} position ${position.positionId} at ${position.escrow}`);
            }

            const closedInPeriod = position.closeBlock !== undefined
                && position.closeBlock >= fromBlock
                && position.closeBlock <= toBlock;
            const positionKey = getV3PositionKey(position);
            let terminalDebt: bigint | undefined;
            let totalRepaid = reductionRepayments.get(positionKey) ?? 0n;
            if (closedInPeriod) {
                const closeRepayment = closeRepayments.get(positionKey);
                if (closeRepayment === undefined) {
                    throw new Error(`Missing Tristero v3 close repayment for ${options.chain} position ${position.positionId} at ${position.escrow}`);
                }
                totalRepaid += closeRepayment;
                terminalDebt = 0n;
            } else {
                terminalDebt = endLoanValues.get(positionKey);
            }
            if (terminalDebt === undefined) {
                throw new Error(`Missing Tristero v3 end loan value for ${options.chain} position ${position.positionId} at ${position.escrow}`);
            }

            const accruedDuringPeriod = terminalDebt + totalRepaid - startValue;
            if (accruedDuringPeriod <= 0n) return;

            addToTokenMap(grossBorrowInterestByToken, position.loanAsset, accruedDuringPeriod);
            borrowInterestFees.add(position.loanAsset, accruedDuringPeriod.toString(), METRIC.BORROW_INTEREST);
        });
    }

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
    Fees: 'Daily borrow interest accrued on legacy and v3 margin positions, including v3 vault loan-value growth, v3 reduction (PositionReduced) repayments, and close repayments, plus any legacy protocol-collected liquidation fees.',
    Revenue: 'Protocol share of legacy margin borrow interest and liquidation fees. V3 borrow interest is attributed to lenders unless a protocol fee event is introduced.',
    ProtocolRevenue: 'Protocol share of legacy margin borrow interest and liquidation fees. V3 borrow interest is attributed to lenders unless a protocol fee event is introduced.',
    SupplySideRevenue: 'Borrow interest attributable to the filler lenders that funded margin positions.',
};

const breakdownMethodology = {
    Fees: {
        [METRIC.BORROW_INTEREST]: 'Borrow interest accrued during the day across active, closed, and liquidated legacy positions, plus v3 vault loan-value growth, v3 reduction (PositionReduced) repayments, and close repayments.',
        [METRIC.LIQUIDATION_FEES]: 'Legacy protocol-collected liquidation fees.',
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
    adapter: Object.fromEntries(
        getTristeroMarginChains().map((chain) => [
            chain,
            { start: getTristeroMarginChainStart(chain) },
        ])
    ),
    fetch,
    pullHourly: true,
    methodology,
    breakdownMethodology,
};

export default adapter;
