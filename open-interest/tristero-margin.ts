import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import {
    getActiveTristeroV3MarginEscrows,
    getOpenTristeroV3MarginPositions,
    getTristeroMarginChainStart,
    getTristeroMarginChains,
    permitFailureMultiCallWithFallback,
    toBigIntOrNull,
    TRISTERO_V3_MARGIN_ABI,
} from "../helpers/tristero";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const openInterestAtEnd = options.createBalances();
    const v3Escrows = getActiveTristeroV3MarginEscrows(options.chain, options.dateString);

    if (!v3Escrows.length) {
        return { openInterestAtEnd };
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
