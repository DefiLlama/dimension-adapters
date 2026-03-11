import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const baseURL = 'https://swap.prod.swing.xyz'
const chains: Record<string, string> = {
    [CHAIN.SOLANA]: 'solana',
    [CHAIN.ETHEREUM]: 'ethereum',
    [CHAIN.BSC]: 'bsc',
    [CHAIN.AVAX]: 'avalanche',
    [CHAIN.POLYGON]: 'polygon',
    [CHAIN.ARBITRUM]: 'arbitrum',
    [CHAIN.ARCHWAY]: 'archway-1',
    [CHAIN.BSQUARED]: 'b2-network',
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

const fetch = async (_t: any, _b: any, options: FetchOptions) => {
    const startOfDay = options.startOfDay;
    const endOfDay = startOfDay + 24 * 60 * 60;

    const dailyRes = await httpGet(`${baseURL}/v0/metrics/stats`, {
        headers: {
            'Content-Type': 'application/json',
        },
        params: { startDate: startOfDay, endDate: endOfDay },
    });

    const chainVolumes = dailyRes?.historicalVolumeCrossChainChain?.map((history: any) => {
        const chainVol = history?.volume?.find((vol: any) => {
            return vol?.chainSlug?.toLowerCase() === chains[options.chain].toLowerCase();
        })
        return chainVol;
    });

    const chainVolume = chainVolumes?.reduce((acc: number, curr: any) => {
        return acc + Number(curr?.value || 0);
    }, 0);

    return {
        dailyBridgeVolume: chainVolume || 0,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        ...Object.entries(chains).reduce((acc, [key, _]) => {
            return {
                ...acc,
                [key]: {
                    fetch,
                    start: '2022-11-01', // 2022-11-01
                },
            };
        }, {}),
    },
    version: 1
};

export default adapter;
