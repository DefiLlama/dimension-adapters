import { start } from "repl";
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
  if (data?.dailyVolume === undefined) {
    console.error(`hinkal: no volume returned for chain ${chainId} (${url})`);
  }
  return {
    dailyVolume: Number(data.dailyVolume),
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
};

export default adapter;
