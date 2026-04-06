import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import {
  getActiveTristeroMarginEscrows,
  getTristeroMarginChainStart,
  getTristeroMarginChains,
  getPositionIds,
  normalizePosition,
  TRISTERO_MARGIN_ABI,
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

  await Promise.all(
    escrows.map(async (escrow, index) => {
      const positionIds = getPositionIds(totalPositionsPerEscrow[index]);
      if (!positionIds.length) return;

      const positions = await options.toApi.multiCall({
        abi: TRISTERO_MARGIN_ABI.positions,
        calls: positionIds.map((positionId) => ({
          target: escrow,
          params: [positionId],
        })),
        permitFailure: true,
      });

      positions.forEach((position: any) => {
        const normalized = normalizePosition(position);
        if (!normalized || normalized.size === 0n) return;
        openInterestAtEnd.add(normalized.token, normalized.size.toString());
      });
    })
  );

  return {
    openInterestAtEnd,
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
};

export default adapter;
