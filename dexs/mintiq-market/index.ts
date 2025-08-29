import axios from "axios";

const API_URL = "https://lwrrxstrfnvgsreqoujq.supabase.co/functions/v1/dynamic-api";

export const adapter = {
  fetch: async () => {
    try {
      const response = await axios.get(API_URL);
      const data = response.data;

      const dailyVolume: Record<string, number> = {};

      data.forEach((item: any) => {
        const key = `xrpl-evm:${item.nftAddress.toLowerCase()}`;
        dailyVolume[key] = item.volume_24h || 0;
      });

      return { dailyVolume };
    } catch (e) {
      console.error("DEXs fetch error:", e);
      return { dailyVolume: {} };
    }
  },
};
