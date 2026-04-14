import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const chainConfig: Record<string, { id: number; start: string }> = {
  [CHAIN.ETHEREUM]: { id: 1, start: "2023-06-22" },
  [CHAIN.OPTIMISM]: { id: 10, start: "2023-09-19" },
  [CHAIN.BSC]: { id: 56, start: "2023-09-20" },
  [CHAIN.XDAI]: { id: 100, start: "2023-01-01" },
  [CHAIN.UNICHAIN]: { id: 130, start: "2025-01-01" },
  [CHAIN.POLYGON]: { id: 137, start: "2023-09-05" },
  [CHAIN.MONAD]: { id: 143, start: "2025-11-01" },
  [CHAIN.SONIC]: { id: 146, start: "2025-01-01" },
  [CHAIN.ZKSYNC]: { id: 324, start: "2025-01-01" },
  [CHAIN.WC]: { id: 480, start: "2026-03-31" },
  [CHAIN.HYPERLIQUID]: { id: 999, start: "2025-01-01" },
  [CHAIN.SONEIUM]: { id: 1868, start: "2026-03-31" },
  [CHAIN.TEMPO]: { id: 4217, start: "2026-03-31" },
  [CHAIN.BASE]: { id: 8453, start: "2023-12-24" },
  [CHAIN.PLASMA]: { id: 9745, start: "2025-10-01" },
  [CHAIN.ARBITRUM]: { id: 42161, start: "2023-09-11" },
  [CHAIN.AVAX]: { id: 43114, start: "2023-01-01" },
  [CHAIN.INK]: { id: 57073, start: "2026-03-31" },
  [CHAIN.LINEA]: { id: 59144, start: "2023-12-14" },
  [CHAIN.BERACHAIN]: { id: 80094, start: "2025-01-25" },
  [CHAIN.PLUME]: { id: 98866, start: "2025-01-01" },
  [CHAIN.KATANA]: { id: 747474, start: "2025-01-01" },
};

const prefetch = async (options: FetchOptions) => {
  const day = options.dateString;
  const url = `https://api.enso.finance/api/v1/reporting/volume/defillama?from=${day}&to=${day}`;
  return httpGet(url, { headers: { origin: "https://defillama.com", }, });
};

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const { chain } = options;
  const config = chainConfig[chain];
  const data: any = options.preFetchedResults

  if (!data) throw new Error(`No data found for date ${options.dateString}`);
  const chainData = data.find((item) => item.chainId === config.id);

  return {
    dailyVolume: chainData?.publishedVolumeUsd ?? 0, //Empty volume chains are not included in the data
  };
};

const adapter: any = {
  version: 1,
  prefetch,
  fetch,
  adapter: chainConfig,
};

export default adapter;
