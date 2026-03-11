import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetchEthereum = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://ethMainnet.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/1`;
  const responseVolume = await fetchURL(urlVolume);
  const dataTotal = responseVolume;
  const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
  return {
    dailyVolume: dailyVolume || 0,
  };
};

const fetchBase = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://base.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/8453`;
  const responseVolume = await fetchURL(urlVolume);
  const dataTotal = responseVolume;
  const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
  return {
    dailyVolume: dailyVolume || 0,
  };
};

const fetchArbitrum = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://arbMainnet.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/42161`;

  const responseVolume = await fetchURL(urlVolume);
  const dataTotal = responseVolume;
  const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
  return {
    dailyVolume: dailyVolume || 0,
  };
};

const fetchPolygon = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://polygon.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/137`;

  const responseVolume = await fetchURL(urlVolume);
  const dataTotal = responseVolume;
  const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
  return {
    dailyVolume: dailyVolume || 0,
  };
};

const fetchBNB = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://bnbMainnet.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/56`;

  const responseVolume = await fetchURL(urlVolume);
  const dataTotal = responseVolume;
  const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
  return {
    dailyVolume: dailyVolume || 0,
  };
};

const fetchAVALANCHE = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://avalanche.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/43114`;

  const responseVolume = await fetchURL(urlVolume);
  const dataTotal = responseVolume;
  const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
  return {
    dailyVolume: dailyVolume || 0,
  };
};

const fetchOPTIMISM = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://optimism.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/10`;

  const responseVolume = await fetchURL(urlVolume);
  const dataTotal = responseVolume;
  const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;

  return {
    dailyVolume: dailyVolume || 0,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchEthereum, start: '2023-11-09' },
    [CHAIN.BASE]: { fetch: fetchBase, start: '2024-03-21' },
    [CHAIN.ARBITRUM]: { fetch: fetchArbitrum, start: '2023-11-08' },
    [CHAIN.POLYGON]: { fetch: fetchPolygon, start: '2023-11-07' },
    [CHAIN.BSC]: { fetch: fetchBNB, start: '2023-11-08' },
    [CHAIN.AVAX]: { fetch: fetchAVALANCHE, start: '2023-11-08' },
    [CHAIN.OPTIMISM]: { fetch: fetchOPTIMISM, start: '2023-11-07' },
  },
};

export default adapter;
