import { Adapter, BaseAdapter, FetchOptions } from "../adapters/types";
import { generateCBCommerceExports } from "../helpers/coinbase-commerce";
import { getSolanaReceived } from '../helpers/token';
import { CHAIN } from "../helpers/chains";

// TODO: check whether 5qR17nnyyBjoHPiGiAD4ZHFCSJixebJCYymArGgZiDnh was an older address where they received payments
const sol = async (options: FetchOptions) => {
    const dailyFees = await getSolanaReceived({ options, targets: ['23vEM5NAmK68uBHFM52nfNtZn7CgpHDSmAGWebsjg5ft', 'AJENSD55ZJBwipZnEf7UzW2pjxex1cV2jSKPz7aMwJo5'] })
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: Adapter = {
    methodology: {
        Fees: 'All fees paid by users for token profile listing.',
        Revenue: 'All fees collected by Dexscreener.',
        ProtocolRevenue: 'All fees collected by Dexscreener.',
    },
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: sol,
        }
    }
}

for (const [chain, item] of Object.entries(generateCBCommerceExports('0xbf07aFF5114BAd83720A8b9Fc7585aFd2ef9E4C2'))) {
    (adapter.adapter as BaseAdapter)[chain] = {
        fetch: (item as any).fetch,
    }
}

export default adapter;
