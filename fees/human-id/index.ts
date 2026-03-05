import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getETHReceived } from "../../helpers/token"

const FEE_RECIPIENTS = ["0xdcA2e9AE8423D7B0F94D7F9FC09E698a45F3c851", "0x0a44b68783f0525e3eaAa349c90bDa884676f2C7"];

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

    const dailyFees = await getETHReceived({
        options,
        targets: FEE_RECIPIENTS,
    })

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    adapter: {
        [CHAIN.ETHEREUM]: { start: '2023-09-20' },
        [CHAIN.OPTIMISM]: { start: '2023-09-06' },
        [CHAIN.FANTOM]: { start: '2023-09-13' },
        [CHAIN.AVAX]: { start: '2023-11-08' },
        [CHAIN.BASE]: { start: '2024-06-05' },
        [CHAIN.LINEA]: { start: '2024-05-04' },
        [CHAIN.SCROLL]: { start: '2023-12-15' },
        [CHAIN.ARBITRUM]: { start: '2025-09-05' },
        [CHAIN.ERA]: { start: '2024-02-14' },
    },
    methodology: {
        Fees: "Fees charged for ID verification",
        Revenue: "All the fees are revenue",
        ProtocolRevenue: "All the fees goes to the protocol",
    },
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM],
}

export default adapter