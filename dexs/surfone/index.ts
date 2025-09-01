import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

// const volumeEndpoint = "https://apigateway.surf.one/pool/24h/data"
const volumeEndpointV2 = "https://apigateway.surf.one/v2/market/total/stat"

const headers = {
    "Block-Chain-Id":"4200",
    "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
};

interface IVolume {
    'total_vol': number,
    '24h_vol': number,
}

const fetch = () => {
    return async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
        const response = (await httpGet(volumeEndpointV2, { headers }));

        const volume: IVolume = response.data;
        return {
            dailyVolume: `${volume['24h_vol'] || undefined}`,
            timestamp: dayTimestamp,
        };
    };
}


const adapter: SimpleAdapter = {
    adapter: {
        ['merlin']: {
            fetch: fetch(),
            runAtCurrTime: true,
        }
    },
};

export default adapter;
