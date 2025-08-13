import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cmavyufix18br01tv219kbmxo/subgraphs/hybra-v2/release/gn'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const query = gql`
        query pairDayDatas{
              pairDayDatas(where: {date: ${options.startOfDay}}, first: 1000, orderBy: dailyVolumeUSD, orderDirection: desc) {
                dailyVolumeUSD

            }
        }
    `

    const data = await request(GRAPH_URL, query)
    const dailyVolume = options.createBalances()
    data.pairDayDatas.forEach((e: any) => {
        dailyVolume.addUSDValue(Number(e.dailyVolumeUSD))
    })

    return {
        dailyVolume
    }
}



const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: '2025-05-22',
        }
    }
}

export default adapter
