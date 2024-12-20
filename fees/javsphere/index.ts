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
    Volume: "LeverageX traders paying fees for open trades.",
}

const API_LEVERAGE_STAT = 'https://1f5i4e87mf.execute-api.eu-central-1.amazonaws.com/prod/cols-stats'

const fetch = async (timestamp: number) => {
    const [statsLevX, prices] = await Promise.all([
        fetchURL(API_LEVERAGE_STAT),
        getPrices([tokenMap.WETH, tokenMap.cbBTC, tokenMap.USDC], timestamp)
    ]);

    const totalFeesInUSD = Object.keys(statsLevX.yield.totalFees).reduce((total, token) => {
        const tokenKey = token as keyof typeof tokenMap;
        const volume = statsLevX.yield.totalFees[token];
        const price = prices[tokenMap[tokenKey]];
        return total + (volume * price.price);
    }, 0);

    const totalDailyFeesInUSD = statsLevX.collaterals.reduce((total: number, collateral: any) => {
        const tokenKey = collateral.collateralName as keyof typeof tokenMap;
        const volume = collateral.lastDayEarned.totalFees;
        const price = prices[tokenMap[tokenKey]]?.price;

        return total + (volume * price || 0);
    }, 0);


    return {
        dailyFees: totalDailyFeesInUSD,
        totalFees: totalFeesInUSD,
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
