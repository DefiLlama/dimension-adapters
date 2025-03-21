import fetchURL from "../../utils/fetchURL";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const tokenMap = {
    WETH: "weth",
    cbBTC: "coinbase-wrapped-btc",
    USDC: "usd-coin"
};

const methodology = {
    Volume: "LeverageX Traders create Volume by placing Trades. User buys and sell JAV token on CEXes and DEXes.",
}

const API_VOLUME_DEX = `https://aws-api.javlis.com/api/javsphere/coin-volume`;
const API_LEVERAGE_STAT = 'https://1f5i4e87mf.execute-api.eu-central-1.amazonaws.com/prod/cols-stats'

const fetch = async (timestamp: number, _t: any, options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const totalVolume = options.createBalances();
    const [stats, statsLevX] = await Promise.all([
        fetchURL(API_VOLUME_DEX),
        fetchURL(API_LEVERAGE_STAT)
    ]);

    Object.keys(statsLevX.yield.totalVolume).forEach((key) => {
        totalVolume.addCGToken(tokenMap[key], statsLevX.yield.totalVolume[key]);
    });

    statsLevX.collaterals.forEach((item) => {
        dailyVolume.addCGToken(tokenMap[item.collateralName], item.lastDayEarned.totalVolume);
    });


    dailyVolume.addUSDValue(stats.volume24);
    totalVolume.addUSDValue(stats.volumeTotal);
    return {
        dailyVolume: dailyVolume,
        totalVolume: totalVolume,
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
