import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

enum providers {
  THORCHAIN = "THORCHAIN",
  NEAR = "NEAR_INTENTS",
  MAYACHAIN = "MAYACHAIN",
  CHAINFLIP = "CHAINFLIP",
}

// date format: YYYY-MM-DD
const fetch = async (provider: providers, startDate: string) => {
  try {
    const VOLUME_ENDPOINT = `https://backend.thorswap.net/stats/dimensions/volume/${provider}?date=${startDate}`;

    const dailyVolume = await httpGet(VOLUME_ENDPOINT);

    return {
      ...dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching Thorswap volume for", provider, ":", error);
    throw error;
  }
};

const fetchNearThorswapVolume = async (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const formattedDate = date.toISOString().split("T")[0];
  return fetch(providers.NEAR, formattedDate);
};

const fetchThorchainThorswapVolume = async (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const formattedDate = date.toISOString().split("T")[0];
  return fetch(providers.THORCHAIN, formattedDate);
};

const fetchMayachainThorswapVolume = async (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const formattedDate = date.toISOString().split("T")[0];
  return fetch(providers.MAYACHAIN, formattedDate);
};

const fetchChainflipThorswapVolume = async (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const formattedDate = date.toISOString().split("T")[0];
  return fetch(providers.CHAINFLIP, formattedDate);
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.THORCHAIN]: {
      fetch: fetchThorchainThorswapVolume,
      start: "2021-04-30",
    },
    [CHAIN.NEAR]: {
      fetch: fetchNearThorswapVolume,
      start: "2025-06-12",
    },
    [CHAIN.MAYA]: {
      fetch: fetchMayachainThorswapVolume,
      start: "2024-04-01",
    },
    [CHAIN.CHAINFLIP]: {
      fetch: fetchChainflipThorswapVolume,
      start: "2024-02-14",
    },
  },
  methodology: {
    Volume: `Thorswap volume is sourced from Thorswap's internal analytics which aggregates swap data across multiple providers including Thorchain, Near, Mayachain, and Chainflip. Sources for each data are as follows:
      - Thorchain: xscanner.org's API https://xscanner.org/api/stats/interfaces/timeseries?interfaceName=t.
      - Mayachain: Data is fetched from xscanner.org's API https://xscanner.org/api/stats/interfaces/timeseries?interfaceName=ts.
      - Near: Data is fetched from Thorswap's Near intents analytics API, which is protected by API key, so we rely on Thorswap's internal cache.
      - Chainflip: Data is fetched from Chainflip GraphQL API. Chainflip recommends caching before distributing, so we rely on Thorswap's internal cache here as well.`,
    DataQuality:
      "Volume data accuracy depends on upstream provider APIs. Thorswap maintains internal caching and validation to ensure data consistency and handle API rate limits.",
  },
};

export default adapter;
