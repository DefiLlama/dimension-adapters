import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getPrices } from "../../utils/prices";


const endpoint = "https://tonfunstats-eqnd7.ondigitalocean.app/api/v1/getVolume"


const fetch = async (options: FetchOptions) => {
    const res = await fetchURL(`${endpoint}?from=${options.startTimestamp}&to=${options.endTimestamp}&service=wagmi`)
    const TON = "coingecko:the-open-network"
    const ton_price = await getPrices([TON], options.startTimestamp);

    return {
        dailyVolume: Number(BigInt(res.volume) / 1000000000n) * ton_price[TON].price,
        timestamp: options.startTimestamp,
    };
};


const adapter: any = {
    version: 2,
    deadFrom: '2025-08-01', // web down, X account removed
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: '2024-10-24',
        },
    },
};

export default adapter;
