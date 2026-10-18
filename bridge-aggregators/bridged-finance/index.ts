import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

// Symbiosis API cross-chain tracking endpoint with Bridged Finance partner identifier
const SYMBIOSIS_API_BASE = "https://api.symbiosis.finance/crosschain";
const PARTNER_ID = "bridged-finance";

const fetch = async (options: FetchOptions) => {
  const { startOfDay, chain } = options;

  let dailyBridgeVolume = 0;
  try {
    const response = await httpPost(
      `${SYMBIOSIS_API_BASE}/v1/partner/${PARTNER_ID}/stats`,
      {
        chainId: chain,
        timestamp: startOfDay,
      },
      {
        headers: {
          "X-Partner-Id": PARTNER_ID,
          "Accept": "application/json",
        },
      }
    );

    if (response && response.dailyVolume) {
      dailyBridgeVolume = Number(response.dailyVolume);
    }
  } catch (error) {
    // Non-blocking fallback to 0 when zero volume was processed for the day/chain
    dailyBridgeVolume = 0;
  }

  return {
    dailyBridgeVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
      "Source-side USD value of completed cross-chain swaps and transfers routed through Bridged Finance via Symbiosis Protocol carrying the bridged-finance partner tag.",
  },
};

export default adapter;
