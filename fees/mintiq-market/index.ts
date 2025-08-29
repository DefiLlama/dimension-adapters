import axios from "axios";

const API_URL = "https://lwrrxstrfnvgsreqoujq.supabase.co/functions/v1/dynamic-api";
const FEE_RATE = 0.05;

export const adapter = {
  fetch: async () => {
    try {
      const response = await axios.get(API_URL);
      const data = response.data;

      const fees: Record<string, number> = {};

      data.forEach((item: any) => {
        const key = `xrpl-evm:${item.nftAddress.toLowerCase()}`;
        fees[key] = (item.volume_24h || 0) * FEE_RATE;
      });

      return { fees };
    } catch (e) {
      console.error("Fees fetch error:", e);
      return { fees: {} };
    }
  },
};
