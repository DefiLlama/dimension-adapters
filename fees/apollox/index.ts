import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { httpGet } from "../../utils/fetchURL";

const FeesAndRevenueURL =  "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all"

const request = () => {
    return (chain: Chain) => {
        return async () => {
            const url = `${FeesAndRevenueURL}?chain=${chain}`
            const { data } = await httpGet(url)
            const { alpFeeVOFor24Hour, allAlpFeeVO } = data
            return {
                dailyFees: alpFeeVOFor24Hour.fee || 0,
                dailyRevenue: alpFeeVOFor24Hour.revenue || 0,
                totalFees: allAlpFeeVO.fee || 0,
                totalRevenue: allAlpFeeVO.revenue || 0,
            };
        }
    }
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.BSC]: {
            runAtCurrTime: true,
            fetch: request()(CHAIN.BSC),
            start: '2023-07-17',
        },
        [CHAIN.ARBITRUM]: {
            runAtCurrTime: true,
            fetch: request()(CHAIN.ARBITRUM),
            start: '2023-07-17',
          },
          [CHAIN.OP_BNB]: {
            runAtCurrTime: true,
            fetch: request()('opbnb'),
            start: '2023-07-17',
          },
          [CHAIN.BASE]: {
            runAtCurrTime: true,
            fetch: request()(CHAIN.BASE),
            start: '2023-07-17',
          }
    }
}

export default adapter;
