import { FetchOptions, SimpleAdapter, FetchV2, FetchResultV2 } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { httpGet } from '../../utils/fetchURL'

interface IFees {
    day: string
    fee: string
}

const getFetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
    const url = 'https://api.base-mainnet.jojo.exchange/v1/private/tradingFee?limit=365'
    const dateStr = new Date((options.startOfDay - 86400) * 1000).toISOString().split('T')[0]
    const res = await httpGet(url)
    delete res['latestTen']
    const item: IFees[] = Object.values(res)
    const dailyFees = item.flat().find((i) => i.day.split('T')[0] === dateStr)?.fee
    return {
        dailyFees: dailyFees ? dailyFees : undefined,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch: getFetch,
            start: '2024-04-09',
        }
    }
}

export default adapter
