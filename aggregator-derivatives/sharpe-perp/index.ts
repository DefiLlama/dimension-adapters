import fetchURL from "../../utils/fetchURL";
import { FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: any): Promise<FetchResultV2> => {
    let timestamp = options.toTimestamp

    const fetchOptions:any = {method: 'GET'};

    const data:any = await fetchURL('https://api-evm.orderly.network/v1/public/volume/stats?broker_id=sharpe_ai')
    const dailyData:any = await fetchURL('https://base-api.sharpe.ai/api/dailySharpePerpVolume')
  
    return {
        totalVolume: data?.data?.perp_volume_ltd,
        dailyVolume: dailyData?.dailyVolume
    };
};
// CHAIN.ARBITRUM, CHAIN.MANTLE, CHAIN.OPTIMISM, CHAIN.BASE, 
export default {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: 1711963031
        },
    },
    version: 2
}
