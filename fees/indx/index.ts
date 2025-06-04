import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from '../../helpers/token';

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetchFees = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    await getETHReceived({ options, balances: dailyFees, targets: [feeAddress] })
    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: Adapter = {
    version: 2,
    isExpensiveAdapter: true,
    adapter: {
        [CHAIN.BASE]: {
            fetch: fetchFees,
            start: '2025-05-17',
            meta: {
                methodology: {
                    Fees: 'ETH fees collected from INDX protocol operations.',
                    Revenue: 'All fees collected are protocol revenue.',
                }
            }
        },
    }
}

export default adapter;
