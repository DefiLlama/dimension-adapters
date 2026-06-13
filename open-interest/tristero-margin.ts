import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import {
    getActiveTristeroMarginEscrows,
    getPositionIds,
    normalizePosition,
    TRISTERO_MARGIN_ABI,
    TRISTERO_MARGIN_CONFIGS,
} from "../helpers/tristeroMargin";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const openInterestAtEnd = options.createBalances();
    const escrows = getActiveTristeroMarginEscrows(options.chain, options.dateString);

    if (!escrows.length) {
        return { openInterestAtEnd };
    }

    const totalPositionsPerEscrow = await options.toApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.totalPositions,
        calls: escrows.map((escrow) => ({ target: escrow })),
        permitFailure: true,
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
        permitFailure: true,
    });

    positions.forEach((position: any) => {
        const normalized = normalizePosition(position);
        if (!normalized || normalized.size === 0n) return;
        openInterestAtEnd.add(normalized.token, normalized.size);
    });

    return {
        openInterestAtEnd,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: TRISTERO_MARGIN_CONFIGS,
    fetch,
};

export default adapter;
