import axios from "axios";
import { Adapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const fetchEthereum = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://ethMainnet.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/1`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestampStart: options.startTimestamp,
      timestampEnd: options.endTimestamp,
      dailyVolume: 0,
    };
  }
};

const fetchBase = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://base.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/8453`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestamp: options.startTimestamp,
      dailyVolume: 0,
    };
  }
};

const fetchArbitrum = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://arbMainnet.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/42161`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestamp: options.startTimestamp,
      dailyVolume: 0,
    };
  }
};

const fetchPolygon = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://polygon.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/137`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestamp: options.startTimestamp,
      dailyVolume: 0,
    };
  }
};

const fetchBNB = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://bnbMainnet.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/56`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestamp: options.startTimestamp,
      dailyVolume: 0,
    };
  }
};

const fetchAVALANCHE = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://avalanche.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/43114`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestamp: options.startTimestamp,
      dailyVolume: 0,
    };
  }
};

const fetchOPTIMISM = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://optimism.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/10`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestamp: options.startTimestamp,
      dailyVolume: 0,
    };
  }
};

const fetchBLAST = async (options: FetchOptions) => {
  const timestampStart = options.startTimestamp;
  const timestampEnd = options.endTimestamp;
  const urlVolume = `https://blast.server.hinkal.pro/totalVolume/${timestampStart}/${timestampEnd}/81457`;
  try {
    const responseVolume = await axios.get(urlVolume);
    const dataTotal = responseVolume.data;
    const dailyVolume = dataTotal.internal_volume + dataTotal.external_volume;
    return {
      timestamp: options.startTimestamp,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return {
      timestamp: options.startTimestamp,
      dailyVolume: 0,
    };
  }
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: 1713561695,
    },
    [CHAIN.BASE]: { fetch: fetchBase, start: 1713561695 },
    [CHAIN.ARBITRUM]: { fetch: fetchArbitrum, start: 1713561695 },
    [CHAIN.POLYGON]: { fetch: fetchPolygon, start: 1713561695 },
    [CHAIN.BSC]: { fetch: fetchBNB, start: 1713561695 },
    [CHAIN.AVAX]: { fetch: fetchAVALANCHE, start: 1713561695 },
    [CHAIN.OPTIMISM]: { fetch: fetchOPTIMISM, start: 1713561695 },
    [CHAIN.BLAST]: { fetch: fetchBLAST, start: 1713561695 },
  },
};

export default adapter;
