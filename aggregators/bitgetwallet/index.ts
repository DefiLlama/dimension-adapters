import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://new-swapopen.bitapi.vip/st/getOrderDayList"

interface IVolumeall {
    volume: string;
    date: string;
}

// to compute volume on chain: https://github.com/DefiLlama/dimension-adapters/pull/2059#issuecomment-2469986758
const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
    const chain = options.chain;
    if (chain === CHAIN.HECO || chain === CHAIN.BASE || chain === CHAIN.ETHEREUM) { return {}} // skip HECO for now
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${chain}`))?.data?.list;

    const dailyVolume = historicalVolume?.find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

    return {
        dailyVolume: dailyVolume
    };
}

const CHAINS: Array<CHAIN> = [
    CHAIN.APTOS,
    CHAIN.ARBITRUM,
    // CHAIN.AVAX,
    CHAIN.BASE,
    CHAIN.BLAST,
    CHAIN.BSC,
    CHAIN.BITCOIN,
    CHAIN.CELO,
    CHAIN.CORE,
    CHAIN.ETHEREUM,
    CHAIN.FANTOM,
    CHAIN.HECO,
    // CHAIN.KLAYTN,
    CHAIN.LINEA,
    CHAIN.MANTA,
    CHAIN.POLYGON,
    CHAIN.MANTLE,
    CHAIN.MORPH,
    CHAIN.NEAR,
    CHAIN.OP_BNB,
    CHAIN.OPTIMISM,
    CHAIN.SOLANA,
    CHAIN.SUI,
    CHAIN.TON,
    CHAIN.TRON,
    CHAIN.ZKFAIR,
    CHAIN.ZKSYNC
];



const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        ...CHAINS.map(chain => {
            return {
                [chain]: {
                    fetch,
                    start: '2022-10-31'
                }
            }
        }).reduce((acc, item) => {
            return {
                ...acc,
                ...item
            }
        })
    }
};

export default adapter;
