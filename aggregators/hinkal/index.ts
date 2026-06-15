import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const VOLUME_URL = "https://wallet-staging-v2.hinkal.io/relayer";

const fetchVolume = (chainId: number) => async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const url = `${VOLUME_URL}/totalVolume/${startTimestamp}/${endTimestamp}/${chainId}`;
  const data = await fetchURL(url);
  if (data?.dailyVolume === undefined) {
    console.error(`hinkal: no volume returned for chain ${chainId} (${url})`);
  }
  return {
    dailyVolume: data?.dailyVolume || 0,
  };
};

const methodology = {
  Volume: "Total value transacted through the Hinkal protocol",
};

const adapter: Adapter = {
  version: 2,
  pullHourly: false, // backend only stores daily-aggregated volume
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchVolume(1), start: "2025-12-13" },
    [CHAIN.BASE]: { fetch: fetchVolume(8453), start: "2025-12-13" },
    [CHAIN.ARBITRUM]: { fetch: fetchVolume(42161), start: "2025-12-13" },
    [CHAIN.POLYGON]: { fetch: fetchVolume(137), start: "2025-12-13" },
    [CHAIN.OPTIMISM]: { fetch: fetchVolume(10), start: "2025-12-13" },
    [CHAIN.SOLANA]: { fetch: fetchVolume(501), start: "2026-02-14" },
    [CHAIN.TRON]: { fetch: fetchVolume(728126428), start: "2026-03-25" },
  },
};

export default adapter;
