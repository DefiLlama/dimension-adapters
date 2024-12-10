import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type DexData = {
    volumeTotal: number,
    volume24: number,
};

const methodology = {
    Volume: "User buys and sell JAV token on CEXes and DEXes.",
}

const fetch = async (timestamp: number) => {
    const stats: DexData = (await fetchURL(`https://aws-api.javlis.com/api/javsphere/coin-volume`)).data;
    return {
        dailyVolume: `${stats.volume24}`,
        timestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            runAtCurrTime: true,
            meta: {
                methodology
            },
        },
    },
};

export default adapter;
