import axios from "axios";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchEthereum = async (options: FetchOptions) => {
  const timestamp = options.endTimestamp;
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=1`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=1`;
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
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=8453`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=8453`;
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
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=42161`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=42161`;
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
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=137`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=137`;
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
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=56`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=56`;
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
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=43114`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=43114`;
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
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=10`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=10`;
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
  const urlTotal = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=false&chainId=81457`;
  const urlDaily = `http://localhost:3000/volume?endDate=${timestamp}&dailyVolume=true&chainId=81457`;
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
