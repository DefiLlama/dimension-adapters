import axios from "axios";

const API_URL = "https://lwrrxstrfnvgsreqoujq.supabase.co/functions/v1/dynamic-api";

interface Collection {
  nftAddress: string;
  floor: number;
  volume_24h: number;
  volume_24h_delta: number;
  floor_delta: number;
}

export const adapter = {
  fetch: async () => {
    const { data } = await axios.get<Collection[]>(API_URL);

    // Приведение к формату dexs
    return data.map(col => ({
      pair: col.nftAddress,
      chain: "xrpl-evm",
      base: col.nftAddress,
      quote: "XRP",
      volumeUsd: col.volume_24h,
      timestamp: new Date(col.timestamp).getTime() / 1000,
    }));
  },
  version: "1.0",
};
