import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const chainConfig: Record<string, { id: number, start: string }> = {
  [CHAIN.ETHEREUM]: { id: 1, start: '2021-06-01' },
  [CHAIN.ARBITRUM]: { id: 42161, start: '2021-09-22' },
  [CHAIN.AVAX]: { id: 43114, start: '2021-06-01' },
  [CHAIN.BSC]: { id: 56, start: '2021-06-01' },
  // [CHAIN.FANTOM]: {id: 250, start: '2021-06-01'},
  [CHAIN.OPTIMISM]: { id: 10, start: '2021-12-16' },
  [CHAIN.POLYGON]: { id: 137, start: '2021-06-01' },
  [CHAIN.LINEA]: { id: 59144, start: '2023-07-11' },
  // [CHAIN.SCROLL]: {id: 534352, start: '2021-09-22'},
  // [CHAIN.ERA]: {id: 324, start: '2023-03-24'},
  // [CHAIN.CRONOS]: { id: 25, start: '2021-06-01' },
  [CHAIN.BASE]: { id: 8453, start: '2023-08-09' },
  [CHAIN.MANTLE]: { id: 5000, start: '2023-07-17' },
  // [CHAIN.BLAST]: {id: 81457, start: '2024-02-29'},
  // [CHAIN.POLYGON_ZKEVM]: { id: 1101, start: '2023-03-27' },
  // [CHAIN.BITTORRENT]: {id: 199, start: '2021-06-01'},
  [CHAIN.SONIC]: { id: 146, start: '2024-12-18' },
  [CHAIN.BERACHAIN]: { id: 80094, start: '2025-02-06' },
  [CHAIN.UNICHAIN]: { id: 130, start: '2025-02-11' },
  [CHAIN.HYPERLIQUID]: { id: 999, start: '2025-07-09' },
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `https://common-service.kyberswap.com/api/v1/aggregator/volume/daily?chainId=${chainConfig[options.chain].id
    }&timestamps=${options.startOfDay}`;
  const data = (
    await httpGet(url, {
      headers: { origin: "https://common-service.kyberswap.com" },
    })
  ).data?.volumes?.[0];

  return {
    dailyVolume: data.value,
  };
};

const adapter = {
  version: 1,
  fetch,
  adapter: chainConfig
};

export default adapter;
