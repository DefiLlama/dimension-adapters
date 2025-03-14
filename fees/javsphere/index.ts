import fetchURL from "../../utils/fetchURL";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const tokenMap = {
    WETH: "weth",
    cbBTC: "coinbase-wrapped-btc",
    USDC: "usd-coin"
};

const methodology = {
    Volume: "LeverageX traders paying fees for open trades.",
}

const API_LEVERAGE_STAT = 'https://1f5i4e87mf.execute-api.eu-central-1.amazonaws.com/prod/cols-stats'

const fetch = async (timestamp: number, _t: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const totalFees = options.createBalances();

    const [statsLevX] = await Promise.all([
        fetchURL(API_LEVERAGE_STAT)
    ]);

    Object.keys(statsLevX.yield.totalFees).forEach((key) => {
        totalFees.addCGToken(tokenMap[key], statsLevX.yield.totalFees[key]);
    });

    statsLevX.collaterals.forEach((item) => {
        dailyFees.addCGToken(tokenMap[item.collateralName], item.lastDayEarned.totalFees);
    });

    return {
        dailyFees: dailyFees,
        totalFees: totalFees,
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
