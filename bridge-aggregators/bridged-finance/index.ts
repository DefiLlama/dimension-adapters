import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_BASE = "https://bridged.finance/api/stats/volume";

const fetch = async (options: FetchOptions) => {
  const { dateString, chain } = options;
  const res = await fetchURL(`${API_BASE}?day=${dateString}&chain=${chain}`);
  return {
    dailyBridgeVolume: Number(res.dailyBridgeVolume ?? res.volume ?? 0),
  };
};

const adapter: SimpleAdapter = {
  version: 1, // endpoint aggregates by UTC day
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2026-01-01" },
    [CHAIN.ARBITRUM]: { fetch, start: "2026-01-01" },
    [CHAIN.BASE]: { fetch, start: "2026-01-01" },
    [CHAIN.BSC]: { fetch, start: "2026-01-01" },
    [CHAIN.POLYGON]: { fetch, start: "2026-01-01" },
    [CHAIN.OPTIMISM]: { fetch, start: "2026-01-01" },
    [CHAIN.AVAX]: { fetch, start: "2026-01-01" },
    [CHAIN.SOLANA]: { fetch, start: "2026-01-01" },
    [CHAIN.LINEA]: { fetch, start: "2026-01-01" },
    [CHAIN.SCROLL]: { fetch, start: "2026-01-01" },
  },
  doublecounted: true,
  methodology: {
    BridgeVolume:
      "USD value of cross-chain swaps and bridge transfers initiated through Bridged Finance interface across supported networks, verified and indexed on-chain.",
  },
};

export default adapter;
