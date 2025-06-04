import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    // Get ETH balance at start and end
    const startBlock = await options.getFromBlock();
    const endBlock = await options.getToBlock();
    
    const startBalance = await options.api.provider.getBalance(feeAddress, startBlock);
    const endBalance = await options.api.provider.getBalance(feeAddress, endBlock);
    
    const ethReceived = endBalance.sub(startBalance);
    if (ethReceived.gt(0)) {
        dailyFees.addGasToken(ethReceived.toString());
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
