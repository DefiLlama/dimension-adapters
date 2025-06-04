import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FeeCollectedEvent = "event FeesCollected(address indexed token, address indexed integrator, uint256 integratorFee, uint256 indxFee)"
const indxFeeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const data: any[] = await options.getLogs({
        target: indxFeeAddress,
        eventAbi: FeeCollectedEvent,
    });
    
    data.forEach((log: any) => {
        dailyFees.add(log.token, log.integratorFee);
        dailyFees.add(log.token, log.indxFee);
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
