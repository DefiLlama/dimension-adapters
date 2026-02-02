import type { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CALCULUS_CONTRACT = "0xb5e6AdA1466840096FcEDCC409528a9cB763f650";
const TOKENPAIR_REGISTRY = "0x497f6e7eF1C0ad1E44A2DF48ee15Fa3B748EE2c6";

const START_TS = 1761980058;

const VAULT_CREATED_EVENT =
    "event VaultCreated(uint64 indexed operationNonce, uint16 tokenPairId, uint32 vaultId, uint256 reserve0, uint256 reserve1, address operator, tuple(uint16 strategyId, bytes metadata) strategy)";

const getTokenPairAddressesAbi =
    "function getTokenPairAddresses(uint16 _id) external view returns (address, address)";

const fetch: FetchV2 = async ({ getLogs, createBalances, api }) => {
    const dailyVolume = createBalances();

    const pairIds = Array.from({ length: 18 }, (_, i) => i + 1);

    const pairs = await api.multiCall({
        abi: getTokenPairAddressesAbi,
        target: TOKENPAIR_REGISTRY,
        calls: pairIds.map((id) => ({ params: [id] })),
    });

    const pairIdToTokens = new Map<number, { token0: string; token1: string }>();
    pairIds.forEach((id, i) => {
        const [token0, token1] = pairs[i] as any;
        if (token0 && token1) {
            pairIdToTokens.set(id, { token0, token1 });
        }
    });

    const logs = await getLogs({
        target: CALCULUS_CONTRACT,
        eventAbi: VAULT_CREATED_EVENT,
    });

    // 3) Sum reserve0 / reserve1 as opening volume
    for (const l of logs as any[]) {
        const tokenPairId = Number(l.tokenPairId ?? l.args?.tokenPairId);
        const pair = pairIdToTokens.get(tokenPairId);
        if (!pair) continue;

        dailyVolume.add(pair.token0, l.reserve0);
        dailyVolume.add(pair.token1, l.reserve1);
    }

    return { dailyVolume };
};

export default {
    version: 2,
    adapter: {
        [CHAIN.BSC]: {
            fetch,
            start: START_TS,
            meta: {
                methodology: {
                    Volume:
                        "Daily opening volume is calculated from the VaultCreated event by summing reserve0 and reserve1, mapped to their corresponding token addresses via tokenPairId. This represents user capital inflow when opening managed LP vaults.",
                },
            },
        },
    },
} as Adapter;
