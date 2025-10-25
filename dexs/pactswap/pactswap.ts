import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

export const PACTSWAP_SUPPORTED_CHAINS = [
    CHAIN.BSC,
    CHAIN.BITCOIN,
    CHAIN.DOGE,
    CHAIN.ETHEREUM,
    CHAIN.LITECOIN,
    CHAIN.POLYGON,
    CHAIN.TRON,
] as const;

const INDEXER_URL = "https://pactswap-indexer.coinhq.store/api/v1/metrics/";

// CAIP-122 chain IDs to bigint for Bitcoin like chains
// # Bitcoin mainnet (see https://github.com/bitcoin/bips/blob/master/bip-0122.mediawiki#definition-of-chain-id)
// bip122:000000000019d6689c085ae165831e93
// # Litecoin mainnet
// bip122:12a765e31ffd4059bada1e25190f6e98
// # Dogecoin mainnet
const PACTSWAP_CHAIN_ID_MAP: Record<typeof PACTSWAP_SUPPORTED_CHAINS[number], bigint> = {
    [CHAIN.BSC]: 56n,
    [CHAIN.BITCOIN]: BigInt("0x".concat("000000000019d6689c085ae165831e93")),
    [CHAIN.DOGE]: BigInt("0x".concat("1a91e3dace36e2be3bf030a65679fe82")),
    [CHAIN.ETHEREUM]: 1n,
    [CHAIN.LITECOIN]: BigInt("0x".concat("12a765e31ffd4059bada1e25190f6e98")),
    [CHAIN.POLYGON]: 137n,
    [CHAIN.TRON]: 128n,
};

export const fetchVolumeFromPactswapAPI = async (
    chain: string,
    startTimestamp: number,
    endTimestamp: number
): Promise<Array<{
    timestamp: string;
    volume: string;
}>> => {
    const chainId = PACTSWAP_CHAIN_ID_MAP[chain];
    try {
        const response = await fetchURL(
            `${INDEXER_URL}swaps/timeseries/volume?chain_id=${chainId}&timestamp_gt=${startTimestamp}&timestamp_lt=${endTimestamp}&interval=day`
        ) as Array<{
            timestamp: string;
            volume: string;
        }>;
        return response
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 2)
            .filter(Boolean);
    } catch (error) {
        console.error(error);
        return [];
    }
};