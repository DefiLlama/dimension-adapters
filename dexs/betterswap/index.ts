import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface BetterSwapResponse {
    volumeUSD: string;
}

// BetterSwap factoryAddress
const factoryAddress = "0x5970dcbebac33e75eff315c675f1d2654f7bf1f5";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
    const startDate = new Date(options.startOfDay * 1000).toISOString().split("T")[0];
    const url = `https://www.betterswap.io/api/volume?startDate=${startDate}&factoryAddress=${factoryAddress}`;

    const response: BetterSwapResponse = await fetchURL(url);

    return {
        dailyVolume: parseFloat(response.volumeUSD),
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.VECHAIN],
    start: '2025-04-30',
};

export default adapter;
