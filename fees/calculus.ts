import type { Adapter, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const TREASURY = "0x94D4B1003F75A953A97B8dE99137336a36E9C111";
const TOKENPAIR_REGISTRY = "0x497f6e7eF1C0ad1E44A2DF48ee15Fa3B748EE2c6";

const START_TS = 1761980058;

const TRANSFER_EVENT =
    "event Transfer(address indexed from, address indexed to, uint256 value)";

const getTokenPairAddressesAbi =
    "function getTokenPairAddresses(uint16 _id) external view returns (address, address)";

const ZERO = "0x0000000000000000000000000000000000000000";

function padTopicAddress(addr: string) {
    return "0x000000000000000000000000" + addr.toLowerCase().replace(/^0x/, "");
}

const fetch: FetchV2 = async ({ getLogs, createBalances, api }) => {
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();

    const pairIds = Array.from({ length: 18 }, (_, i) => i + 1);
    const pairs = await api.multiCall({
        abi: getTokenPairAddressesAbi,
        target: TOKENPAIR_REGISTRY,
        calls: pairIds.map((id) => ({ params: [id] })),
    });

    const tokenSet = new Set<string>();
    for (const p of pairs as any[]) {
        const token0 = (p?.[0] as string | undefined)?.toLowerCase();
        const token1 = (p?.[1] as string | undefined)?.toLowerCase();
        if (!token0 || !token1) continue;
        if (token0 === ZERO || token1 === ZERO) continue;
        tokenSet.add(token0);
        tokenSet.add(token1);
    }
    const tokens = Array.from(tokenSet);
    if (!tokens.length) return { dailyFees, dailyRevenue };

    const toTopic = padTopicAddress(TREASURY);
    const treasuryLc = TREASURY.toLowerCase();
    const TRANSFER_TOPIC0 =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    for (const token of tokens) {
        const transferLogs = await getLogs({
            target: token,
            eventAbi: TRANSFER_EVENT,
            topics: [TRANSFER_TOPIC0,null, toTopic] as any,
        });

        for (const t of transferLogs as any[]) {
            // extra safety: ensure decoded `to` equals treasury
            const to = (t?.to as string | undefined)?.toLowerCase();
            if (to && to !== treasuryLc) continue;

            dailyFees.add(token, t.value);
            dailyRevenue.add(token, t.value);
        }
    }

    return { dailyFees, dailyRevenue };
};

export default {
    version: 2,
    adapter: {
        [CHAIN.BSC]: {
            fetch,
            start: START_TS,
            meta: {
                methodology: {
                    Fees: "Fees are calculated as all ERC20 transfers to the Calculus treasury address for supported token pairs on BSC.",
                    Revenue: "All fees are treated as protocol revenue since they are transferred directly to the treasury.",
                },
            },
        },
    },
} as Adapter;
