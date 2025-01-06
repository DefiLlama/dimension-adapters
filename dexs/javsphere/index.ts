import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {getPrices} from "../../utils/prices";

const tokenMap = {
    WETH: "coingecko:weth",
    cbBTC: "coingecko:coinbase-wrapped-btc",
    USDC: "coingecko:usd-coin"
};

const methodology = {
    Volume: "LeverageX Traders create Volume by placing Trades. User buys and sell JAV token on CEXes and DEXes.",
}

const API_VOLUME_DEX = `https://aws-api.javlis.com/api/javsphere/coin-volume`;
const API_LEVERAGE_STAT = 'https://1f5i4e87mf.execute-api.eu-central-1.amazonaws.com/prod/cols-stats'

const fetch = async (timestamp: number) => {
    const [stats, statsLevX, prices] = await Promise.all([
        fetchURL(API_VOLUME_DEX),
        fetchURL(API_LEVERAGE_STAT),
        getPrices([tokenMap.WETH, tokenMap.cbBTC, tokenMap.USDC], timestamp)
    ]);

    const totalVolumeInUSD = Object.keys(statsLevX.yield.totalVolume).reduce((total, token) => {
        const tokenKey = token as keyof typeof tokenMap;
        const volume = statsLevX.yield.totalVolume[token];
        const price = prices[tokenMap[tokenKey]];
        return total + (volume * price.price);
    }, 0);

    const totalDailyVolumeInUSD = statsLevX.collaterals.reduce((total: number, collateral: any) => {
        const tokenKey = collateral.collateralName as keyof typeof tokenMap;
        const volume = collateral.lastDayEarned.totalVolume;
        const price = prices[tokenMap[tokenKey]]?.price;

        return total + (volume * price || 0);
    }, 0);

    return {
        dailyVolume: totalDailyVolumeInUSD + stats.volume24,
        totalVolume: totalVolumeInUSD + stats.volumeTotal,
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
