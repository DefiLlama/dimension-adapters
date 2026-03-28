import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const ROCKET_API_URL = 'https://beta.rocket-cluster-1.com';

async function fetch(_options: FetchOptions) {

    const instrumentsData = await fetchURL(`${ROCKET_API_URL}/instruments`);

    let openInterestAtEnd = 0;
    const instrumentStats: Record<string, any> = instrumentsData.instrumentStats;
    for (const instrument of Object.entries(instrumentStats)) {
        const [id, data] = instrument;
        const oi = data.openInterest;
        const price = instrumentsData.instruments[id].lastMatchPrice;
        openInterestAtEnd += oi * price;
    }

    return {
        openInterestAtEnd,
    };

}

const adapter: SimpleAdapter = {
    version: 2,
    runAtCurrTime: true,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
}

export default adapter;