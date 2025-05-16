import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FASTLANE_AUCTION_HANDLER = '0x5003676390dfe662Af408Eb0bf13e182aDcaCE0a';

const fetch = async (options: FetchOptions) => {
    const logs = await options.getLogs({
        target: FASTLANE_AUCTION_HANDLER,
        eventAbi: 'event RelayFeeCollected(address indexed payor, address indexed payee, uint256 amount)',
        parseLog: true,
        entireLog: true
    });
    const dailyFees = options.createBalances();
    for (const log of logs) {
        dailyFees.addGasToken(log.args.amount);
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
