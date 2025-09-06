import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const CHAINS: Array<CHAIN> = [
    // CHAIN.ETHEREUM,
    CHAIN.POLYGON,
    // CHAIN.SOLANA,
    CHAIN.BSC,
    CHAIN.OPTIMISM,
    CHAIN.BASE,
    CHAIN.TON,
    CHAIN.TRON,
    CHAIN.BITCOIN,
    CHAIN.MANTA,
    CHAIN.LINEA,
    CHAIN.SUI,
    CHAIN.SCROLL,
    CHAIN.ARBITRUM,
    CHAIN.CORE,
    CHAIN.MERLIN,
    CHAIN.BLAST,
    CHAIN.APTOS
];

interface IVolumeBridge {
    volume: string;
    date: string;
}

async function queryDataByApi(path: string) {
    const historicalVolumeEndpoint = "https://api-3rd.bitkeep.com/swap-go/open";
    let info = await fetchURL(`${historicalVolumeEndpoint}${path}`);
    const data: IVolumeBridge[] = (info)?.data?.list || [];
    return data
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const startOfDay = options.startOfDay;
    const path = `/getOrderDayVolume?bridge=1&chain=${options.chain}&timestamp=${startOfDay}`
    const data = await queryDataByApi(path)
    const dateString = new Date(startOfDay * 1000).toISOString().split("T")[0];
    const dailyVolume = data.find(dayItem => dayItem.date === dateString)?.volume

    return {
        dailyBridgeVolume: dailyVolume || 0,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        ...CHAINS.map(chain => {
            return {
                [chain]: {
                    fetch,
                    start: '2025-04-01'
                }
            }
        }).reduce((acc, item) => {
            return {
                ...acc,
                ...item
            }
        })
    },
};

export default adapter;
