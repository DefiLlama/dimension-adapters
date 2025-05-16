import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FASTLANE_AUCTION_HANDLER = '0xCACe8D78269ba00f1C4D5Fc3B1228C7DF0a7C8BA';

const fetch = async (options: FetchOptions) => {
    const logs = await options.getLogs({
        target: FASTLANE_AUCTION_HANDLER,
        eventAbi: 'event RelayFeeCollected(address indexed payor, address indexed payee, uint256 amount)',
    });
    const dailyFees = options.createBalances();
    for (const log of logs) {
        dailyFees.addGasToken(log.amount);
    }
    return { dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.POLYGON]: {
            fetch,
            start: '2023-11-17',
            meta: {
                methodology: {
                    fees: "MEV fees paid by searchers to validators for priority transaction inclusion (bundles) on the Polygon network.",
                }
            }
        },
    }
};

export default adapter;
