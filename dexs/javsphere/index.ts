
import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type DexData = {
    countTotal: number,
    volumeTotal: number,
    feeTotal: number,
    tradesBuy: number,
    volumeBuy: number,
    volumeBuyFees: number,
    countSell: number,
    volumeSell: number,
    volumeSellFees: number
};

const fetch = async (timestamp: number) => {
    const stats: DexData = (await fetchURL(`https://aws-api.javlis.com/api/dtoken/stats`)).data;
    console.log(stats)
    return {
        totalVolume: `${stats.volumeTotal}`,
        totalFees: `${stats.feeTotal}`,
        timestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.DEFICHAIN]: {
            fetch,
            start: 0,
            runAtCurrTime: true
        },
    },
};

export default adapter;
