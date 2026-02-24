import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphFees";

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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const unixTimestamp = getUniqStartOfTodayTimestamp(
        new Date(options.startOfDay * 1000)
    );

    // get the end of the day timestamp 
    const unixEndDayTimestamp = getUniqStartOfTodayTimestamp(
        new Date(options.startOfDay * 1000 + 24 * 60 * 60 * 1000)
    );

    const dailyRes = await httpGet(`${baseURL}/v0/metrics/stats`, {
        headers: {
            'Content-Type': 'application/json',
        },
        params: { startDate: unixTimestamp, endDate: unixEndDayTimestamp },
    });

    const chainFees = dailyRes?.historicalFeeByChain?.map((history: any) => {
        const fees = history?.volume.find((vol: any) => {
            return vol?.chainSlug.toLowerCase() === chains[options.chain].toLowerCase();
        })
        return fees;
    });

    let dailyFees = chainFees?.reduce((acc: number, curr: any) => {
        return acc + Number(curr?.value || 0);
    }, 0);
    if (dailyFees >= 25000) { // Very high spikes in the fees API, so kept yearly fee as a safe guard to prevent spikes
        dailyFees = 0;
    }
    return {
        dailyFees: dailyFees || 0
    };
};


const methodology = {
    UserFees: "Users pays 0.3% of each bridge. The exact fee is calculated based on the partner fee configuration but not over 10%.",
    Fees: "A 0.3% bridge fee is collected",
    Revenue: "100% of the fee collected, 85% of the fee collected to partners, 15% of the fee collected to treasury",
    ProtocolRevenue: "A 15% of the fee collected to treasury",
};

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    version: 1,
    chains: Object.keys(chains),
    start: '2023-11-01',
    adapter: {}
};

export default adapter;

