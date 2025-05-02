import { Adapter, FetchOptions } from "../adapters/types";
import { generateCBCommerceExports } from "../helpers/coinbase-commerce";
import { getSolanaReceived } from '../helpers/token';
import { CHAIN } from "../helpers/chains";

// TODO: check whether 5qR17nnyyBjoHPiGiAD4ZHFCSJixebJCYymArGgZiDnh was an older address where they received payments
const sol = async (options: FetchOptions) => {
    const dailyFees = await getSolanaReceived({ options, targets: ['23vEM5NAmK68uBHFM52nfNtZn7CgpHDSmAGWebsjg5ft', 'AJENSD55ZJBwipZnEf7UzW2pjxex1cV2jSKPz7aMwJo5'] })
    return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        ...generateCBCommerceExports('0xbf07aFF5114BAd83720A8b9Fc7585aFd2ef9E4C2'),
        [CHAIN.SOLANA]: {
            fetch: sol,
        }
    }
}

export default adapter;
