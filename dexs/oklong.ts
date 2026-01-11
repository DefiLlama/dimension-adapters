import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const BROKER_ID = "oklong";
const API_ENDPOINT = `https://api-evm.orderly.org/v1/public/volume/stats?broker_id=${BROKER_ID}`;

const fetch = async (timestamp: number) => {
    const response = await httpGet(API_ENDPOINT);
    const stats = response.data || response;

    const dailyVol = stats.perp_volume_last_1_day || stats.perp_volume_today || "0";
    const totalVol = stats.perp_volume_ltd || undefined;

    return {
        dailyVolume: dailyVol,
        totalVolume: totalVol,
        timestamp: timestamp,
    };
};

const methodology = {
    dailyVolume: "Volume is calculated by fetching the 24h rolling volume from the Orderly Network API for the 'oklong' broker ID.",
    totalVolume: "Cumulative volume is fetched from the 'perp_volume_ltd' field in the Orderly API."
}
const adapter: SimpleAdapter = {
    version: 2, // Explicitly declare V2 as recommended by docs
    adapter: {
        [CHAIN.ORDERLY]: {
            fetch: fetch,
            start: 1761091200, // REPLACE with your actual launch timestamp
            runAtCurrTime: true,
        },

    },
    methodology
};

export default adapter;