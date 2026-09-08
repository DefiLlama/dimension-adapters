import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const VOLUME_URL = "https://wallet-staging-v2.hinkal.io/relayer";

const chainConfig = {
  [CHAIN.ETHEREUM]: { id: 1, start: "2025-12-13" },
  [CHAIN.BASE]: { id: 8453, start: "2025-12-13" },
  [CHAIN.ARBITRUM]: { id: 42161, start: "2025-12-13" },
  [CHAIN.POLYGON]: { id: 137, start: "2025-12-13" },
  [CHAIN.OPTIMISM]: { id: 10, start: "2025-12-13" },
  [CHAIN.SOLANA]: { id: 501, start: "2026-02-14" },
  [CHAIN.TRON]: { id: 728126428, start: "2026-03-25" }
}

const fetch = async (options: FetchOptions) => {
  const { startOfDay, endTimestamp } = options;
  const chainId = chainConfig[options.chain].id;
  const url = `${VOLUME_URL}/totalVolume/${startOfDay}/${endTimestamp}/${chainId}`;
  const data = await fetchURL(url);
  const reported = data?.dailyVolume;
  const dailyVolume =
    reported == null || (typeof reported === "string" && reported.trim() === "")
      ? NaN
      : Number(reported);
  if (!Number.isFinite(dailyVolume))
    throw new Error(
      `hinkal: relayer returned ${JSON.stringify(reported)} for chain ${chainId} on ${options.dateString}, it only serves the day thats still in progress`
    );
  return {
    dailyVolume,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
};

export default adapter;
