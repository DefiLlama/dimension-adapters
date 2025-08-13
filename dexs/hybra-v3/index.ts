import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cmbj707z4cd9901sib1f6cu0c/subgraphs/hybra-v3/v3/gn'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const query = gql`
          query poolDayDatas{
              poolDayDatas(where: {date: ${options.startOfDay}}, first: 1000, orderBy: volumeUSD, orderDirection: desc) {
                volumeUSD
                feesUSD

            }
        }
    `

    const data = await request(GRAPH_URL, query)
    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    data.poolDayDatas.forEach((e: any) => {
        dailyVolume.addUSDValue(Number(e.volumeUSD))
        dailyFees.addUSDValue(Number(e.feesUSD))
    })


    return {
        dailyVolume,
        dailyFees,
    }
}



const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: '2025-06-23',
        }
    }
}

export default adapter
