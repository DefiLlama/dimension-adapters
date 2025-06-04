import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    // Track ETH balance changes (captures internal transactions)
    const startBalance = await options.fromApi.call({
        target: feeAddress,
        abi: 'uint256:getBalance',
        block: options.fromBlock,
    });
    
    const endBalance = await options.toApi.call({
        target: feeAddress,
        abi: 'uint256:getBalance',
        block: options.toBlock,
    });
    
    const ethReceived = Number(endBalance) - Number(startBalance);
    if (ethReceived > 0) {
        dailyFees.addGasToken(ethReceived);
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
