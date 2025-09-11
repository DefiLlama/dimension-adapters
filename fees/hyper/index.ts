import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";

interface TokenInfo {
    ticker: string;
    token_name: string;
    decimals: number;
}

interface PeriodData {
    bets: Record<string, unknown>;
    fees: {
        total: number;
        [key: string]: unknown;
    };
    vol: Record<string, unknown>;
}

interface TokenData {
    info: TokenInfo;
    past_1h: PeriodData;
    past_6h: PeriodData;
    past_24h: PeriodData;
    past_7d: PeriodData;
    past_30d: PeriodData;
    all_time: PeriodData;
}

interface StatsResponse {
    data: Record<string, TokenData>;
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const totalFees = options.createBalances();
    const totalRevenue = options.createBalances();

    try {
        const stats: StatsResponse = await fetchURL(`https://mf-flip.fly.dev/stats`);
        if (!stats.data) {
            console.warn("No stats data found in stats response");
            return { dailyFees, dailyRevenue, totalFees, totalRevenue };
        }

        const tokenEntries = Object.entries(stats.data);

        if (tokenEntries.length === 0) {
            console.warn("No token data found in stats response");
            return { dailyFees, dailyRevenue, totalFees, totalRevenue };
        }

        const tokenAddresses = tokenEntries.map(([address]) => address);
        const tokenIds = tokenAddresses.map((address) => `solana:${address}`);

        let prices: Record<string, { price: number }> = {};

        try {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            prices = await getPrices(tokenIds, currentTimestamp);
        } catch (error) {
            console.error("Error fetching prices:", error);
        }

        const processedTokens = await Promise.allSettled(
            tokenEntries.map(async ([tokenAddress, tokenData]) => {
                return processTokenFees(
                    tokenAddress,
                    tokenData,
                    prices,
                    dailyFees,
                    dailyRevenue,
                    totalFees,
                    totalRevenue
                );
            })
        );

        const failedTokens = processedTokens
            .filter((result): result is PromiseRejectedResult => result.status === "rejected")
            .map((result) => result.reason);

        if (failedTokens.length > 0) {
            console.warn(`Failed to process ${failedTokens.length} tokens:`, failedTokens);
        }

        const successfulTokens = processedTokens.filter((result) => result.status === "fulfilled").length;
        console.log(`Successfully processed ${successfulTokens}/${tokenEntries.length} tokens`);
    } catch (error) {
        console.error("Error fetching Hyper stats:", error);
        return { dailyFees, dailyRevenue, totalFees, totalRevenue };
    }

    return {
        dailyFees,
        dailyRevenue,
        totalFees,
        totalRevenue,
    };
};

// Separate function for processing individual tokens (Single Responsibility Principle)
async function processTokenFees(
    tokenAddress: string,
    tokenData: TokenData,
    prices: Record<string, { price: number }>,
    dailyFees: any,
    dailyRevenue: any,
    totalFees: any,
    totalRevenue: any
): Promise<void> {
    const { info, past_24h, all_time } = tokenData;

    // Calculate daily fee metrics
    const dailyHouseBetFees = parseFloat(String(past_24h?.fees?.house_bet_fees || "0"));
    const dailyPvpBetFees = parseFloat(String(past_24h?.fees?.pvp_bet_fees || "0"));
    const dailyHousePnl = parseFloat(String(past_24h?.fees?.house_pnl || "0"));

    // Calculate all-time fee metrics
    const allTimeHouseBetFees = parseFloat(String(all_time?.fees?.house_bet_fees || "0"));
    const allTimePvpBetFees = parseFloat(String(all_time?.fees?.pvp_bet_fees || "0"));
    const allTimeHousePnl = parseFloat(String(all_time?.fees?.house_pnl || "0"));

    // Calculate metrics
    const dailyFeesAmount = dailyPvpBetFees + dailyHouseBetFees; // Daily PvP + PvH fees
    const dailyRevenueAmount = Math.max(0, dailyFeesAmount + dailyHousePnl); // Daily fees + house PnL (PnL can be negative but framework requires non-negative)

    const totalFeesAmount = allTimePvpBetFees + allTimeHouseBetFees; // All-time PvP + PvH fees
    const totalRevenueAmount = Math.max(0, totalFeesAmount + allTimeHousePnl); // All-time fees + house PnL (PnL can be negative but framework requires non-negative)

    // Validate required data exists
    if (!dailyFeesAmount || dailyFeesAmount <= 0) {
        console.warn(`No daily fees found for token ${info.ticker} (${tokenAddress})`);
        return;
    }

    const tokenId = `solana:${tokenAddress}`;
    const priceData = prices[tokenId];

    if (!priceData?.price) {
        console.warn(`Skipping token ${info.ticker} (${tokenAddress}) - price not available`);
        return; // Skip this token entirely if not on defillama api
    }

    // Convert to USD
    const dailyFeesInUSD = dailyFeesAmount * priceData.price;
    const dailyRevenueInUSD = dailyRevenueAmount * priceData.price;
    const totalFeesInUSD = totalFeesAmount * priceData.price;
    const totalRevenueInUSD = totalRevenueAmount * priceData.price;

    // Add USD values directly to ensure proper calculation
    dailyFees.addUSDValue(dailyFeesInUSD);
    dailyRevenue.addUSDValue(dailyRevenueInUSD);
    totalFees.addUSDValue(totalFeesInUSD);
    totalRevenue.addUSDValue(totalRevenueInUSD);
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: "2024-08-18",
        },
    },
    methodology: {
        Fees: "Fees collected (3%) from PvH (Player vs House) and PvP (Player vs Player) games across all supported tokens",
        Revenue: "Fees + House PnL",
    },
};

export default adapter;
