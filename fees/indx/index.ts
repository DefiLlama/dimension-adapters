import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0'.toLowerCase();

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    const startBalance = await options.fromApi.call({
        target: feeAddress,
        abi: 'function balanceOf() view returns (uint256)',
        params: [],
    });
    
    const endBalance = await options.toApi.call({
        target: feeAddress,
        abi: 'function balanceOf() view returns (uint256)',
        params: [],
    });
    
    const received = Number(endBalance) - Number(startBalance);
    if (received > 0) {
        dailyFees.addGasToken(received);
    }
    
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
