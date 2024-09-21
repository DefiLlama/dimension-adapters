import axios from "axios";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchEthereum = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://ethMainnet.server.hinkal.pro/totalVolume/${timestamp}/false/1`;
  const urlDaily = `https://ethMainnet.server.hinkal.pro/totalVolume/${timestamp}/true/1`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const fetchBase = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://base.server.hinkal.pro/totalVolume/${timestamp}/false/8453`;
  const urlDaily = `https://base.server.hinkal.pro/totalVolume/${timestamp}/true/8453`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const fetchArbitrum = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://arbMainnet.server.hinkal.pro/totalVolume/${timestamp}/false/42161`;
  const urlDaily = `https://arbMainnet.server.hinkal.pro/totalVolume/${timestamp}/true/42161`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const fetchPolygon = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://polygon.server.hinkal.pro/totalVolume/${timestamp}/false/137`;
  const urlDaily = `https://polygon.server.hinkal.pro/totalVolume/${timestamp}/true/137`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const fetchBNB = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://bnbMainnet.server.hinkal.pro/totalVolume/${timestamp}/false/56`;
  const urlDaily = `https://bnbMainnet.server.hinkal.pro/totalVolume/${timestamp}/true/56`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const fetchAVALANCHE = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://avalanche.server.hinkal.pro/totalVolume/${timestamp}/false/43114`;
  const urlDaily = `https://avalanche.server.hinkal.pro/totalVolume/${timestamp}/true/43114`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const fetchOPTIMISM = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://optimism.server.hinkal.pro/totalVolume/${timestamp}/false/10`;
  const urlDaily = `https://optimism.server.hinkal.pro/totalVolume/${timestamp}/true/10`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const fetchBLAST = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `https://blast.server.hinkal.pro/totalVolume/${timestamp}/false/81457`;
  const urlDaily = `https://blast.server.hinkal.pro/totalVolume/${timestamp}/true/81457`;
  try {
    const responseTotal = await axios.get(urlTotal);
    const dataTotal = responseTotal.data;
    const totalVolume = dataTotal.internal_volume + dataTotal.external_volume;

    const responseDaily = await axios.get(urlDaily);
    const dataDaily = responseDaily.data;
    const dailyVolume = dataDaily.internal_volume + dataDaily.external_volume;
    return { totalVolume, dailyVolume };
  } catch (error) {
    console.error("Error fetching volume:", error);
    return { totalVolume: 0, dailyVolume: 0 };
  }
};

const adapter: Adapter = {
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
