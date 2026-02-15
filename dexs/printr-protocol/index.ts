import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const PRINTR_CONTRACT = "0xb77726291b125515d0a7affeea2b04f2ff243172";

const TOKEN_TRADE_EVENT =
    "event TokenTrade(address indexed token, address indexed trader, bool isBuy, uint256 amount, uint256 cost, uint256 priceAfter, uint256 issuedSupply, uint256 reserve)";

const GET_CURVE_ABI =
    "function getCurve(address token) view returns (tuple(address basePair, uint16 totalCurves, uint256 maxTokenSupply, uint256 virtualReserve, uint256 reserve, uint256 completionThreshold))";

// 1% total bonding curve swap fee
// Fee split: 25% creator, 25% memecoin reserve, 40% buyback, 10% team
const FEE_RATE = 1 / 100;

const fetch = async ({ getLogs, createBalances, api }: FetchOptions) => {
    const dailyVolume = createBalances();

    const tradeLogs = await getLogs({
        target: PRINTR_CONTRACT,
        eventAbi: TOKEN_TRADE_EVENT,
    });

    if (!tradeLogs.length) {
        return { dailyVolume, dailyFees: createBalances() };
    }

    // Get unique token addresses to resolve their basePair token
    const uniqueTokens = Array.from(new Set(tradeLogs.map((log: any) => log.token)));

    const curves = await api.multiCall({
        abi: GET_CURVE_ABI,
        calls: uniqueTokens.map((token) => ({
            target: PRINTR_CONTRACT,
            params: [token],
        })),
        permitFailure: true,
    });

    // Build token -> basePair mapping
    const tokenBasePair: Record<string, string> = {};
    uniqueTokens.forEach((token: string, i: number) => {
        if (curves[i]?.basePair) {
            tokenBasePair[token] = curves[i].basePair;
        }
    });

    // Accumulate volume by basePair token
    // cost = the trade amount denominated in the base pair token
    for (const log of tradeLogs) {
        const basePair = tokenBasePair[log.token];
        if (!basePair) continue;
        dailyVolume.add(basePair, log.cost);
    }

    // Derive fee breakdown from volume
    const dailyFees = dailyVolume.clone(FEE_RATE); // 1% total fee
    const dailyRevenue = dailyFees.clone(0.5); // team (10%) + buyback (40%) = 50%
    const dailyProtocolRevenue = dailyFees.clone(0.1); // 10% team
    const dailyHoldersRevenue = dailyFees.clone(0.4); // 40% buyback
    const dailySupplySideRevenue = dailyFees.clone(0.5); // 25% creator + 25% memecoin reserve

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: { fetch, start: "2025-10-14" },
        [CHAIN.BSC]: { fetch, start: "2025-10-14" },
        [CHAIN.ARBITRUM]: { fetch, start: "2025-10-14" },
        [CHAIN.BASE]: { fetch, start: "2025-10-14" },
        [CHAIN.AVAX]: { fetch, start: "2025-10-14" },
        [CHAIN.MANTLE]: { fetch, start: "2025-10-14" },
        [CHAIN.MONAD]: { fetch, start: "2025-10-14" },
    },
    methodology: {
        Volume:
            "Total trading volume from bonding curve buys and sells on the Printr protocol, tracked via on-chain TokenTrade events. Each trade's cost is denominated in the curve's base pair token (e.g. USDC, WETH, BNB).",
        Fees: "Printr charges a 1% fee on all bonding curve swaps.",
        Revenue:
            "Revenue includes the team (10%) and buyback (40%) portions of the 1% trading fee.",
        ProtocolRevenue: "10% of trading fees go to the Printr team.",
        HoldersRevenue:
            "40% of trading fees are used for buybacks, benefiting Printr token holders.",
        SupplySideRevenue:
            "25% of trading fees go to token creators and 25% to the memecoin reserve for community growth.",
    },
};

export default adapter;
