import {Adapter, FetchV2} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {httpGet} from "../../utils/fetchURL";

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
        dailyFees: dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue: dailySupplySideRevenue
    };
}

const adapter: Adapter = {
    version: 2,
    methodology: {
        Fees: 'Swap fees paid by users',
        UserFees: 'Swap fees paid by users',
        Revenue: 'The amount of swap fees for protocol',
        ProtocolRevenue: 'The amount of swap fees for protocol',
        SupplySideRevenue: 'The amount of swap fees distributed to LPs',
    },
    fetch,
    chains: [CHAIN.TON],
    start: '2025-05-09',
}

export default adapter;