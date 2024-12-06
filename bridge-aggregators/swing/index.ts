import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphFees";

const chains: Record<string, string> = {
    [CHAIN.SOLANA]: 'solana',
    [CHAIN.ETHEREUM]: 'ethereum',
    [CHAIN.BSC]: 'bsc',
    [CHAIN.AVAX]: 'avalanche',
    [CHAIN.POLYGON]: 'polygon',
    [CHAIN.ARBITRUM]: 'arbitrum',
    [CHAIN.ARCHWAY]: 'archway-1',
    [CHAIN.B2_NETWORK]: 'b2-network',
    [CHAIN.BASE]: 'base',
    [CHAIN.BITCOIN]: 'bitcoin',
    [CHAIN.BITLAYER]: 'bitlayer',
    [CHAIN.BLAST]: 'blast',
    [CHAIN.BOB]: 'bob',
    [CHAIN.CORE]: 'core-blockchain',
    [CHAIN.COSMOS]: 'cosmoshub-4',
    [CHAIN.FANTOM]: 'fantom',
    [CHAIN.XDAI]: 'gnosis',
    [CHAIN.GRAVITY]: 'gravity',
    [CHAIN.INJECTIVE]: 'injective-1',
    [CHAIN.LINEA]: 'linea',
    [CHAIN.MANTA]: 'manta-pacific',
    [CHAIN.MANTLE]: 'mantle',
    [CHAIN.METIS]: 'metis',
    [CHAIN.MODE]: 'mode',
    [CHAIN.MOONBEAM]: 'moonbeam',
    [CHAIN.MORPH]: 'morph',
    [CHAIN.CELESTIA]: 'cataclysm-1',
    [CHAIN.OPTIMISM]: 'optimism',
    [CHAIN.OSMOSIS]: 'osmosis-1',
    [CHAIN.SCROLL]: 'scroll',
    [CHAIN.TAIKO]: 'taiko',
    [CHAIN.WC]: 'world-chain',
    [CHAIN.ZKSYNC]: 'zksync-era',
};

const fetchVolume = async (_t: any, _b: any, options: FetchOptions) => {
    const unixTimestamp = getUniqStartOfTodayTimestamp(
        new Date(options.startOfDay * 1000)
    );

    const dailyRes = await httpGet("https://swap.prod.swing.xyz/v0/metrics/stats", {
        headers: {
            'Content-Type': 'application/json',
        },
        params: { startDate: unixTimestamp },
    });

    const chainVolumes = dailyRes?.historicalVolumeByChain?.map((history: any) => {
        const chainVol = history?.volume.find((vol: any) => {
            return vol?.chainSlug.toLowerCase() === chains[options.chain].toLowerCase();
        })

        return chainVol;
    });

    // calculate the total volume
    const chainVolume = chainVolumes?.reduce((acc: number, curr: any) => {
        return acc + Number(curr?.value || 0);
    }, 0);

    return {
        dailyBridgeVolume: chainVolume || 0,
        timestamp: unixTimestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        ...Object.entries(chains).reduce((acc, chain) => {
            const [key, value] = chain;

            return {
                ...acc,
                [key]: {
                    fetch: fetchVolume,
                    start: '2022-11-01', // 2022-11-01
                },
            };
        }, {}),
    },
    version: 1
};

export default adapter;

