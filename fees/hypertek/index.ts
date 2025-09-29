import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

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

    const stats: StatsResponse = await fetchURL(`https://mf-flip.fly.dev/stats`);

    const tokenEntries = Object.entries(stats.data);
    tokenEntries.forEach(([tokenAddress, tokenData]) => {
        const { info, past_24h } = tokenData;

        const dailyHouseBetFees = parseFloat(String(past_24h?.fees?.house_bet_fees || "0"));
        const dailyPvpBetFees = parseFloat(String(past_24h?.fees?.pvp_bet_fees || "0"));
        const dailyHousePnl = parseFloat(String(past_24h?.fees?.house_pnl || "0"));

        const dailyFeesAmount = dailyPvpBetFees + dailyHouseBetFees; // Daily PvP + PvH fees
        const dailyRevenueAmount = dailyFeesAmount + dailyHousePnl;

        dailyFees.add(tokenAddress, dailyFeesAmount * (10 ** info.decimals));
        dailyRevenue.add(tokenAddress, dailyRevenueAmount * (10 ** info.decimals));
    });

    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailyHoldersRevenue: 0 };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2024-08-18",
    runAtCurrTime: true,
    allowNegativeValue: true, // As house PnL can be negative
    methodology: {
        Fees: "Fees collected (3%) from PvH (Player vs House) and PvP (Player vs Player) games across all supported tokens",
        Revenue: "Fees collected from players + House PnL(it can be negative)",
    },
};

export default adapter;
