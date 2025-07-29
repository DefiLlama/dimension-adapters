import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface BetterSwapResponse {
    volumeVET: string;
    volumeUSD: string;
    totalTransactions: number;
    vetPriceUSD: string;
    startDate: string;
    endDate: string;
    factoryAddress: string;
}

// BetterSwap factoryAddress
const factoryAddress = "0x5970dcbebac33e75eff315c675f1d2654f7bf1f5";

const fetch = async (options: FetchOptions) => {
    const startDate = new Date(options.startTimestamp * 1000)
        .toISOString()
        .split("T")[0];
    const url = `https://www.betterswap.io/api/volume?startDate=${startDate}&factoryAddress=${factoryAddress}`;

    const response: BetterSwapResponse = await httpGet(url);

    return {
        dailyVolume: parseFloat(response.volumeUSD),
        timestamp: options.startTimestamp,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.VECHAIN]: {
            fetch,
            start: 1745971200, // 2025-04-30
        },
    },
};

export default adapter;
