import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";


const historicalVolumeEndpoint = "https://new-swapopen.bitapi.vip/st/getOrderDayList"

interface IVolumeall {
    volume: string;
    date: string;
}

// to compute volume on chain: https://github.com/DefiLlama/dimension-adapters/pull/2059#issuecomment-2469986758
const graph = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultVolume> => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
        const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint + `?chain=${chain}`))?.data?.list;

        const totalVolume = historicalVolume?.filter(volItem => (new Date(volItem.date).getTime() / 1000) <= dayTimestamp)
            .reduce((acc, { volume }) => acc + Number(volume), 0)

        const dailyVolume = historicalVolume?.find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

        return {
            totalVolume: `${totalVolume}`,
            dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
            timestamp: dayTimestamp,
        };
    }
}

const CHAINS: Array<CHAIN> = [
    CHAIN.APTOS,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.BASE,
    CHAIN.BLAST,
    CHAIN.BSC,
    CHAIN.BITCOIN,
    CHAIN.CELO,
    CHAIN.CORE,
    CHAIN.DOGECHAIN,
    CHAIN.ETHEREUM,
    CHAIN.FANTOM,
    CHAIN.HECO,
    CHAIN.KLAYTN,
    CHAIN.LINEA,
    CHAIN.MANTA,
    CHAIN.POLYGON,
    CHAIN.MANTLE,
    CHAIN.MORPH,
    CHAIN.NEAR,
    CHAIN.OKEXCHAIN,
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
    adapter: {
        ...CHAINS.map(chain => {
            return {
                
                    [chain]: {
                        fetch: graph(chain),
                        start: 1667232000
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
