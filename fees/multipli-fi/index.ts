import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const chainConfig: Record<string, Record<string, string>> = {
    [CHAIN.ETHEREUM]: { formattedName: "Ethereum" },
    [CHAIN.BSC]: { formattedName: "Binance" },
    [CHAIN.AVAX]: { formattedName: "Avalanche" },
};

const multipliTokenMap: Record<string, any> = {
    xusdc: {
        underlying: {
            [CHAIN.ETHEREUM]: "USDC",
            [CHAIN.BSC]: "USDC",
            [CHAIN.AVAX]: "AVALANCHEUSDC",
        },
        coingeckoId: "usd-coin",
    },
    xusdt: {
        underlying: {
            [CHAIN.ETHEREUM]: "USDT",
            [CHAIN.BSC]: "USDT",
        },
        coingeckoId: "tether",
    },
    xwbtc: {
        underlying: {
            [CHAIN.ETHEREUM]: "WBTC",
            [CHAIN.BSC]: "WBTC",
            [CHAIN.AVAX]: "BTC.B",
        },
        coingeckoId: "wrapped-bitcoin",
    },
};

async function prefetch(_a: any): Promise<any> {
    const tvlData = await fetchURL("https://api.llama.fi/protocol/multipli.fi");
    const yieldsData = await fetchURL(
        "https://api.multipli.fi/multipli/v1/get-historical-yield-rate/?currencies=usdc%2Cusdt%2Cbtc&period=max"
    );

    if (!tvlData || !yieldsData)
        throw new Error("Tvl data or yields data not found");

    return {
        tvlData,
        yieldsData,
    };
}

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const formattedChainName = chainConfig[options.chain].formattedName;
    const periodWrtYear =
        (options.toTimestamp - options.fromTimestamp) / (365 * 24 * 60 * 60);

    const dailyFees = options.createBalances();
    const { tvlData, yieldsData } = options.preFetchedResults;

    const tokensTvlToday = tvlData.chainTvls[formattedChainName].tokens.find(
        (entry: any) => entry.date === options.startOfDay
    ).tokens;

    for (const [xToken, tokenDetails] of Object.entries(multipliTokenMap)) {
        const totalYieldEntries = yieldsData.payload[xToken][0].data.length;
        const underlyingToken = tokenDetails.underlying[options.chain];
        if (!underlyingToken) continue;

        const latestTvl = tokensTvlToday[underlyingToken];
        const latestApy =
            yieldsData.payload[xToken][0].data[totalYieldEntries - 1].value;

        const yieldForPeriod = (latestTvl * latestApy * periodWrtYear) / 100;
        dailyFees.addCGToken(
            tokenDetails.coingeckoId,
            yieldForPeriod,
            METRIC.ASSETS_YIELDS
        );
    }

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue: dailyFees,
    };
}

const methodology = {
    Fees: "Asset yields on deposited assets",
    Revenue:
        "No deposit or withdrawal fees, no transparent mention of performance/management fees",
    SupplySideRevenue: "Yields on assets recieved by users",
};

const adapter: SimpleAdapter = {
    version: 1,
    prefetch,
    fetch,
    adapter: chainConfig,
    start: "2025-03-15",
    methodology,
};

export default adapter;
