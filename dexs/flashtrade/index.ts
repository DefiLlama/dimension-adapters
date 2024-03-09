import { BreakdownAdapter, ProtocolType, FetchResultVolume } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const marketsCombinedVolumeDaily = "https://api.prod.flash.trade/market-stat/volume-all-markets-24hr";

const fetchPerpVolume = async(
    timestamp: number
):Promise<FetchResultVolume> => {
    const dailyStats = (await fetchURL(marketsCombinedVolumeDaily));
    return {
        dailyVolume: dailyStats?.total_volume_in_usd.toString(),
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