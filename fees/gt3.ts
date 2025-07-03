import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { cache } from "@defillama/sdk";
import { addTokensReceived } from "../helpers/token";

const factory = "0x2d7360Db7216792cfc2c73B79C0cA629007E2af4";
const fetch = async (options: FetchOptions) => {
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory.toLowerCase()}-${
    options.chain
  }.json`;
  const { pairs } = await cache.readCache(cacheKey, {
    readFromR2Cache: true,
  });
  const fees = await (options.api.multiCall({
    abi: "address:fees",
    calls: pairs,
    permitFailure: true,
  }) as Promise<string[]>);
  const dailyFees = await addTokensReceived({
    options,
    targets: fees,
  });
  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: "2025-04-23",
    },
  },
};

export default adapter;
