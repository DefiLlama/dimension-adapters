import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FundsSentEvent = "event FundsSent(address recipient, address token, uint256 amount)";
const FeesSentEvent = "event FeesSent(uint32 dappId, address token, uint256 amount)";

const SVault = '0x305a2694dD75ecb7D6ACbf0Efcd55278c992eEB9';
const Gateway = '0x149c4DD9A1f2A4de605bE2b63d60540A8865a288';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    // Get FeesSent events
    const feesData: any[] = await options.getLogs({
        target: Gateway,
        eventAbi: FeesSentEvent
    });
    feesData.forEach((log: any) => {
        dailyFees.add(log.token, log.amount);
    });

    // Get FundsSent events with recipient SVault
    const fundsData: any[] = await options.getLogs({
        target: Gateway,
        eventAbi: FundsSentEvent,
        onlyArgs: true
    });
    fundsData.forEach((log: any) => {
        if (log.recipient.toLowerCase() === SVault.toLowerCase()) {
            dailyFees.add(log.token, log.amount);
        }
    });

    return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2025-04-30',
        }
    },
    methodology: {
        Fees: "Fees paid by users using privacy services.",
        Revenue: "Fees paid by users using privacy services.",
    }
};

export default adapter;
