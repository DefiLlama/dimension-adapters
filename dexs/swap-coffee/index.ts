import {Adapter, FetchV2} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {httpGet} from "../../utils/fetchURL";

function normalizeAddress(address: string): string {
    return address == "native" ? "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c" : address
}

const fetch: FetchV2 = async ({startTimestamp, endTimestamp, createBalances}) => {
    const statistics = await httpGet(
        `https://dex.swap.coffee/api/v1/llama/volumes`,
        {
            params: {
                startTimestamp: startTimestamp,
                endTimestamp: endTimestamp
            }
        })

    const dailyVolumes = createBalances();

    for (let address of Object.keys(statistics)) {
        const volume = statistics[address]

        dailyVolumes.add(normalizeAddress(address), volume)
    }

    return {
        timestamp: startTimestamp,
        dailyVolume: dailyVolumes
    };
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: '2025-05-09',
        },
    }
}

export default adapter;