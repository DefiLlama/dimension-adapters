import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    // Track ETH transfers to the fee address - all ETH considered revenue
    await options.getFromAddresses({
        targets: [feeAddress],
        options: {
            includeGasToken: true
        }
    }).then((transfers) => {
        transfers.forEach(transfer => {
            dailyFees.add(transfer.token, transfer.amount);
        });
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
