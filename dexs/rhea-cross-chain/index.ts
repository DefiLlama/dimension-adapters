import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
const getRheaCrossChainVolume = async () => {
    return (await httpGet('https://api.ref.finance/get_cross_chain_total_volume_24h')).data;
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.NEAR]: {
            runAtCurrTime: true,
            fetch: async (_ts: any, _t: any, options: FetchOptions) => {
                const volume24 = await getRheaCrossChainVolume();
                return {
                    timestamp: options.startOfDay,
                    dailyVolume: volume24,
                }
            }
        }
    }
};

export default adapter;