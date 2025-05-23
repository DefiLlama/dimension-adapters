import { BreakdownAdapter, ProtocolType, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const marketsCombinedVolumeDaily = "https://api.prod.flash.trade/market-stats";

const fetchPerpVolume = async (
    timestamp: number
): Promise<FetchResultVolume> => {
    const marketStats = (await fetchURL(marketsCombinedVolumeDaily));
    return {
        dailyVolume: marketStats?.dailyVolumeInUsd.toString(),
        totalVolume: marketStats?.totalVolumeInUsd.toString(),
        timestamp: timestamp
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetchPerpVolume,
            start: '2024-03-10' // start time llama collect
        }
    },
    protocolType: ProtocolType.PROTOCOL,
}

export default adapter;
