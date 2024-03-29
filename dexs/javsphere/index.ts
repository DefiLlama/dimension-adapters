
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
    volumeSellFees: number,
    volume24: number,
    fee24: number

};

const methodology = {
    Fees: "User pays 0.1% fees on each trade.",
    Volume: "User buys and sell RWA tokens.",
}

const fetch = async (timestamp: number) => {
    const stats: DexData = (await fetchURL(`https://aws-api.javlis.com/api/dtoken/stats`)).data;
    return {
        totalVolume: `${stats.volumeTotal}`,
        totalFees: `${stats.feeTotal}`,
        dailyFees: `${stats.fee24}`,
        dailyVolume: `${stats.volume24}`,
        timestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.DEFICHAIN]: {
            fetch,
            start: 0,
            runAtCurrTime: true,
            meta: {
                methodology
            },
        },
    },
};

export default adapter;
