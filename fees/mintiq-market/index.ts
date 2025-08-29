import axios from "axios";

const API_URL = "https://lwrrxstrfnvgsreqoujq.supabase.co/functions/v1/dynamic-api";

interface Collection {
  nftAddress: string;
  volume_24h: number;
}

export const adapter = {
  fetch: async () => {
    const { data } = await axios.get<Collection[]>(API_URL);

    return data.map(col => ({
      pool: col.nftAddress,
      chain: "xrpl-evm",
      project: "MintiqMarket NFT Marketplace",
      feeType: "protocol",
      fee: 0.05, // 5%
      volume: col.volume_24h,
      timestamp: new Date().getTime() / 1000,
    }));
  },
  version: "1.0",
};
