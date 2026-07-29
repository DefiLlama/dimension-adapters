import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface BetterSwapResponse {
    volumeUSD: string;
}

const factoryAddress = "0xf9f1722f95d036efbd1352d84e3a3755f8027b39";

const fetch = async (options: FetchOptions) => {
    const url = `https://www.betterswap.io/api/volume?startDate=${options.dateString}&factoryAddress=${factoryAddress}`;
    const response: BetterSwapResponse = await fetchURL(url);

    return {
        dailyVolume: parseFloat(response.volumeUSD),
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.VECHAIN],
    start: "2026-07-20",
};

export default adapter;
