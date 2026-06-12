import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import {
    getActiveTristeroMarginEscrows,
    getActiveTristeroV3MarginEscrows,
    getOpenTristeroV3MarginPositions,
    getPositionIds,
    getTristeroMarginChainStart,
    getTristeroMarginChains,
    normalizePosition,
    permitFailureMultiCallWithFallback,
    toBigIntOrNull,
    TRISTERO_MARGIN_ABI,
    TRISTERO_V3_MARGIN_ABI,
} from "../helpers/tristeroMargin";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const openInterestAtEnd = options.createBalances();
    const escrows = getActiveTristeroMarginEscrows(options.chain, options.dateString);
    const v3Escrows = getActiveTristeroV3MarginEscrows(options.chain, options.dateString);

    if (!escrows.length && !v3Escrows.length) {
        return { openInterestAtEnd };
    }

    if (escrows.length) {
        const totalPositionsPerEscrow = await options.toApi.multiCall({
            abi: TRISTERO_MARGIN_ABI.totalPositions,
            calls: escrows.map((escrow) => ({ target: escrow })),
        });

        const escrowToPositionIds = totalPositionsPerEscrow.map((totalPositions, index) => ({
            escrow: escrows[index],
            positionIds: getPositionIds(totalPositions),
        }));

        const positions = await options.toApi.multiCall({
            abi: TRISTERO_MARGIN_ABI.positions,
            calls: escrowToPositionIds.flatMap(({ escrow, positionIds }) => positionIds.map((positionId) => ({
                target: escrow,
                params: [positionId],
            }))),
        });

        positions.forEach((position: any) => {
            const normalized = normalizePosition(position);
            if (!normalized || normalized.size === 0n) return;
            openInterestAtEnd.add(normalized.token, normalized.size);
        });
    }

    if (v3Escrows.length) {
        const v3Positions = await getOpenTristeroV3MarginPositions(options, v3Escrows);
        const notionals = v3Positions.length
            ? await permitFailureMultiCallWithFallback(options, options.toApi, {
                abi: TRISTERO_V3_MARGIN_ABI.readValue,
                calls: v3Positions.map((position) => ({
                    target: position.vault,
                    params: [position.underlyingAsset, position.notionalShares.toString()],
                })),
            }, `v3 open interest readValue for ${v3Positions.length} positions`)
            : [];

        v3Positions.forEach((position, index) => {
            const notional = toBigIntOrNull(notionals[index]);
            if (notional === null) {
                throw new Error(`Unable to read Tristero v3 notional value for ${options.chain} position ${position.positionId} at ${position.escrow}`);
            }

            if (notional === 0n) return;
            openInterestAtEnd.add(position.underlyingAsset, notional);
        });
    }

    return {
        openInterestAtEnd,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: Object.fromEntries(
        getTristeroMarginChains().map((chain) => [
            chain,
            { start: getTristeroMarginChainStart(chain) },
        ])
    ),
    fetch,
};

export default adapter;
