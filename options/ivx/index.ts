import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import fetchURL from "../../utils/fetchURL";

const IVX_API = "https://api.ivx.fi/v1"
const fetch = async (timestamp) => {

    let volume = 0;
    const response = await fetchURL(`${IVX_API}/api/options/trading-volume-chart?intervalType=1d&timestamp=${timestamp}`,);
    response.data.forEach(element => {
        volume += element.totalTradingVolume;
    });
    return { dailyNotionalVolume: volume }
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.BERACHAIN]: {
            fetch,
        },
    },
};

export default adapter;