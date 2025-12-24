import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://api-3rd.bitkeep.com/swap-go/open/getOrderDayVolume"

interface IVolumeall {
    volume: string;
    date: string;
}

// to compute volume on chain: https://github.com/DefiLlama/dimension-adapters/pull/2059#issuecomment-2469986758
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const chain = options.chain;
    const startOfDay = options.startOfDay;
    const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${chain}`))?.data?.list;
    const dailyVolume = historicalVolume?.find(dayItem => (new Date(dayItem.date).getTime() / 1000) === startOfDay)?.volume
    return {
        dailyVolume
    };
}

const CHAINS: Array<CHAIN> = [
    CHAIN.APTOS,
    CHAIN.HYPERLIQUID,
    CHAIN.SOLANA,
    CHAIN.BLAST,
    CHAIN.BITCOIN,
    CHAIN.ARBITRUM,
    CHAIN.KLAYTN,
    CHAIN.SONIC,
    CHAIN.MANTLE,
    CHAIN.RIPPLE,
    CHAIN.AVAX,
    CHAIN.LINEA,
    CHAIN.SUI,
    CHAIN.SCROLL,
    CHAIN.BASE,
    CHAIN.POLYGON,
    CHAIN.TON,
    CHAIN.CRONOS,
    CHAIN.DOGECHAIN,
    CHAIN.BERACHAIN,
    CHAIN.MONAD,
    CHAIN.TRON,
    CHAIN.CELO,
    CHAIN.BSC,
    CHAIN.MORPH,
    CHAIN.XLAYER,
    CHAIN.CORE,
    CHAIN.OP_BNB,
    CHAIN.ZKSYNC,
    CHAIN.ETHEREUM,
    CHAIN.OPTIMISM,
    CHAIN.FANTOM,
    CHAIN.PLASMA,
    CHAIN.SEI
];



const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        ...CHAINS.map(chain => {
            return {
                [chain]: {
                    fetch,
                    start: '2025-09-01'
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
