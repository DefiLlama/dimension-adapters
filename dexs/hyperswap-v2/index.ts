import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cm97l77ib0cz601wlgi9wb0ec/subgraphs/v2-subgraph/3.0.0/gn'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const query = gql`
        query q{
            tokenDayDatas(where: {date: ${options.startOfDay} }, first: 1000, orderBy: dailyVolumeUSD, orderDirection: desc) {
                dailyVolumeUSD
            }
        }
    `

    const data = await request(GRAPH_URL, query)
    const dailyVolume = options.createBalances()

    data.tokenDayDatas.forEach((e: any) => {
        dailyVolume.addUSDValue(Number(e.dailyVolumeUSD))
    })

    const dailyFees = dailyVolume.clone(0.003)
    const dailyRevenue = dailyFees.clone(0.4)
    const dailyProtocolRevenue = dailyFees.clone(0.08)
    const dailySupplySideRevenue = dailyFees.clone(0.6)
    const dailyHoldersRevenue = dailyFees.clone(0.32)

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "Total swap fees paid by users.",
    Revenue: "8% protocol revenue share and 32% holders revenue share.",
    ProtocolRevenue: "8% of fees collected by the protocol.",
    SupplySideRevenue: "60% of fees distributed to LPs.",
    HoldersRevenue: "32% of fees used for buy-back and burn.",
    UserFees: "Total swap fees paid by users."
}

const adapter: SimpleAdapter = {
    methodology,
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: '2025-02-18',
        }
    }
}

export default adapter
