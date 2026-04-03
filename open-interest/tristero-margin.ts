import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import {
  getPositionIds,
  normalizePosition,
  TRISTERO_MARGIN_ABI,
  TRISTERO_MARGIN_CONFIG,
} from "../helpers/tristeroMargin";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const openInterestAtEnd = options.createBalances();

  const totalPositions = await options.toApi.call({
    target: TRISTERO_MARGIN_CONFIG.escrow,
    abi: TRISTERO_MARGIN_ABI.totalPositions,
  });
  const positionIds = getPositionIds(totalPositions);

  if (!positionIds.length) {
    return { openInterestAtEnd };
  }

  const positions = await options.toApi.multiCall({
    abi: TRISTERO_MARGIN_ABI.positions,
    calls: positionIds.map((positionId) => ({
      target: TRISTERO_MARGIN_CONFIG.escrow,
      params: [positionId],
    })),
    permitFailure: true,
  });

  positions.forEach((position: any) => {
    const normalized = normalizePosition(position);
    if (!normalized || normalized.size === 0n) return;
    openInterestAtEnd.add(normalized.token, normalized.size.toString());
  });

  return {
    openInterestAtEnd,
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
};

export default adapter;
