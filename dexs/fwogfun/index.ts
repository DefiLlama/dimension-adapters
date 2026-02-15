import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const STATS_URL = "https://api.fwog.fun/stats";

interface TokenAmount {
    sol: number;
    usd: number;
}

interface StatsBlock {
    total: TokenAmount;
    regular: TokenAmount;
    fwogtok: TokenAmount;
    fwogcasts: TokenAmount;
    legacy: TokenAmount;
    x: TokenAmount;
}

interface StatsResponse {
    allTime: {
        fees: StatsBlock;
        revenue: StatsBlock;
        volume: StatsBlock;
    };
    daily: {
        fees: StatsBlock;
        revenue: StatsBlock;
        volume: StatsBlock;
    };
}

const CATEGORIES = ["regular", "fwogtok", "fwogcasts", "x"] as const;

function addByCategory(
    balances: ReturnType<FetchOptions["createBalances"]>,
    data: StatsBlock,
) {
    for (const cat of CATEGORIES) {
        const val = data[cat].sol;
        if (val > 0) {
            balances.addCGToken("solana", val, cat);
        }
    }
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    const res: StatsResponse = await fetchURL(STATS_URL);

    addByCategory(dailyRevenue, res.daily.fees);
    addByCategory(dailySupplySideRevenue, res.daily.revenue);
    addByCategory(dailyVolume, res.daily.volume);

    dailyFees.add(dailyRevenue);
    dailyFees.add(dailySupplySideRevenue);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Total trading fees collected from all swaps on the platform.",
    Revenue: "Protocol revenue received by the protocol treasury.",
    ProtocolRevenue: "Revenue received by the protocol treasury.",
    SupplySideRevenue: "Revenue received by creators for X coins and fwogtok.",
    Volume: "Trading volume from api.fwog.fun",
};

const breakdownMethodology = {
    Fees: {
        "regular": "Trading fees from regular/legacy tokens.",
        "fwogtok": "Trading fees from Fwogtok tokens.",
        "fwogcasts": "Trading fees from Fwogcasts.",
        "x": "Trading fees from Twitter/X tokens.",
    },
    Revenue: {
        "regular": "Protocol revenue from regular tokens.",
        "fwogtok": "Protocol revenue from Fwogtok tokens.",
        "fwogcasts": "Protocol revenue from Fwogcasts.",
        "x": "Protocol revenue from Twitter/X tokens.",
    },
    ProtocolRevenue: {
        "regular": "Treasury revenue from regular/legacy tokens.",
        "fwogtok": "Treasury revenue from Fwogtok tokens.",
        "fwogcasts": "Treasury revenue from Fwogcasts.",
        "x": "Treasury revenue from Twitter/X tokens.",
    },
    SupplySideRevenue: {
        "regular": "Creator revenue from regular/legacy tokens.",
        "fwogtok": "Creator revenue from Fwogtok tokens.",
        "fwogcasts": "Creator revenue from Fwogcasts.",
        "x": "Creator revenue from Twitter/X tokens.",
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    methodology,
    breakdownMethodology,
    runAtCurrTime: true,
};

export default adapter;
