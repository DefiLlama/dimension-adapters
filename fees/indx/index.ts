import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    const balances = await options.api.getBalances([feeAddress]);
    Object.entries(balances).forEach(([token, balance]) => {
        dailyFees.add(token, balance);
    });
    
    return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: '2025-05-17'
        }
    }
};

export default adapter;
