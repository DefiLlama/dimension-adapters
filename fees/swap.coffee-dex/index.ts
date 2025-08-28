import {Adapter, FetchV2} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {httpGet} from "../../utils/fetchURL";
import {getPrices} from "../../utils/prices";

function normalizeAddress(address: string): string {
    return address == "native" ? "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c" : address
}

const fetch: FetchV2 = async ({startTimestamp, endTimestamp, createBalances}) => {
    const statistics = await httpGet(
        `https://dex.swap.coffee/api/v1/llama/fees`,
        {
            params: {
                startTimestamp: startTimestamp,
                endTimestamp: endTimestamp
            }
        })

    const tokens = statistics.map((entry: any) => `ton:${normalizeAddress(entry["address"])}`)
    const prices = (await getPrices(tokens, startTimestamp))

    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const dailySupplySideRevenue = createBalances()

    for (let entry of statistics) {
        const address = normalizeAddress(entry["address"])
        const lpFee = entry["lp"]
        const protocolFee = entry["protocol"]

        dailyFees.add(address, lpFee + protocolFee)
        dailyRevenue.add(address, protocolFee)
        dailySupplySideRevenue.add(address, lpFee)
    }

    return {
        timestamp: startTimestamp,
        dailyFees: dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue: dailySupplySideRevenue
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