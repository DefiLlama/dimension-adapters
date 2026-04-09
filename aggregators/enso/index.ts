import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions,  } from "../../adapters/types";

const chains: Record<string, { id: number; start: string }> = {
    [CHAIN.ETHEREUM]: { id: 1, start: "2026-04-01" },
    [CHAIN.OPTIMISM]: { id: 10, start: "2026-04-01" },
    [CHAIN.BSC]: { id: 56, start: "2026-04-01" },
    [CHAIN.XDAI]: { id: 100, start: "2026-04-01" },
    [CHAIN.UNICHAIN]: { id: 130, start: "2026-04-01" },
    [CHAIN.POLYGON]: { id: 137, start: "2026-04-01" },
    [CHAIN.MONAD]: { id: 143, start: "2026-04-01" },
    [CHAIN.SONIC]: { id: 146, start: "2026-04-01" },
    [CHAIN.ZKSYNC]: { id: 324, start: "2026-04-01" },
    [CHAIN.WC]: { id: 480, start: "2026-04-01" },
    [CHAIN.HYPERLIQUID]:{ id: 999, start: "2026-04-01" },
    [CHAIN.SONEIUM]: { id: 1868, start: "2026-04-01" },
    [CHAIN.TEMPO]: { id: 4217, start: "2026-04-01" },
    [CHAIN.BASE]: { id: 8453, start: "2026-04-01" },
    [CHAIN.PLASMA]: { id: 9745, start: "2026-04-01" },
    [CHAIN.ARBITRUM]: { id: 42161, start: "2026-04-01" },
    [CHAIN.AVAX]: { id: 43114, start: "2026-04-01" },
    [CHAIN.INK]: { id: 57073, start: "2026-04-01" },
    [CHAIN.LINEA]: { id: 59144, start: "2026-04-01" },
    [CHAIN.BERACHAIN]: { id: 80094, start: "2026-04-01" },
    [CHAIN.PLUME]: { id: 98866, start: "2026-04-01" },
    [CHAIN.KATANA]: { id: 747474, start: "2026-04-01" },
};

const toUtcDay = (timestamp: number) =>
    new Date(timestamp * 1000).toISOString().slice(0, 10);

const fetchVolume = async (_: any, _1: any, options: FetchOptions) => {
    const { endTimestamp, chain } = options;
    const chainConfig = chains[chain];
    if (!chainConfig) {
        throw new Error(`Chain configuration not found for: ${chain}`);
    }
    const day = toUtcDay(endTimestamp);
    const url = `https://api.enso.finance/api/v1/reporting/volume/defillama?chainId=${chainConfig.id}&from=${day}&to=${day}`;
    const response = await httpGet(url, {
        headers: {
            origin: "https://defillama.com"
        },
    });
    return {
        dailyVolume: response?.[0]?.publishedVolumeUsd ?? "0",
        timestamp: endTimestamp,
    };
};

const adapter: any = {
    version: 1,
    isExpensiveAdapter: false,
    adapter: Object.fromEntries(
        Object.entries(chains).map(([chain, { start }]) => [
            chain,
            { fetch: fetchVolume, start },
        ])
    ),
};

export default adapter;