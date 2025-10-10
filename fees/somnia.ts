import { blockscoutFeeAdapter2 } from "../helpers/blockscoutFees";
import { CHAIN } from "../helpers/chains";
import {METRIC} from "../helpers/metrics";

const somnia = blockscoutFeeAdapter2(CHAIN.SOMNIA);
const info = {
    methodology: {
        Fees: 'Total SOMI gas fees paid by users (gas usage × gas unit price, after any discounts)',
        Revenue: '50% of total fees are burned',
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.TRANSACTION_GAS_FEES]: 'Total SOMI fees paid by users'
        },
        Revenue: {
            [METRIC.TRANSACTION_GAS_FEES]: '50% share of total SOMI fees will be burned'
        },
    }
}
export default {...somnia, ...info}
