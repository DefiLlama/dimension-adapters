import { BreakdownAdapter, ProtocolType, FetchResultVolume } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const marketsCombinedVolumeDaily = "https://api.prod.flash.trade/market-stats";

const fetchPerpVolume = async(
    timestamp: number
):Promise<FetchResultVolume> => {
    const marketStats = (await fetchURL(marketsCombinedVolumeDaily));
    return {
        dailyVolume: marketStats?.dailyVolumeInUsd.toString(),
        totalVolume: marketStats?.totalVolumeInUsd.toString(),
        timestamp: timestamp
    }
}

const adapter: BreakdownAdapter = {
    breakdown: {
        perp: {
            solana: {
                fetch: fetchPerpVolume, 
                runAtCurrTime: true,    
                customBackfill: undefined,
                start: 0
            }
        }
    },
    protocolType: ProtocolType.PROTOCOL,
}

export default adapter;