import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FASTLANE_AUCTION_HANDLER_V1 = '0xf5DF545113DeE4DF10f8149090Aa737dDC05070a';
const FASTLANE_AUCTION_HANDLER_V2 = '0xCACe8D78269ba00f1C4D5Fc3B1228C7DF0a7C8BA';

const eventAbis = {
    v1: 'event RelayFlashBid(address indexed sender, uint256 amount, bytes32 indexed oppTxHash, address indexed validator, address searcherContractAddress)',
    v21: 'event RelayFlashBid(address indexed sender, bytes32 indexed oppTxHash, address indexed validator, uint256 bidAmount, uint256 amountPaid, address searcherContractAddress)',
    v22: 'event RelayFastBid(address indexed sender, address indexed validator, bool success, uint256 bidAmount, address searcherContractAddress)',
    v23: 'event RelayFeeCollected(address indexed payor, address indexed payee, uint256 amount)',
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const v1_logs = await options.getLogs({
        target: FASTLANE_AUCTION_HANDLER_V1,
        eventAbi: eventAbis.v1,
        entireLog: true,
    });
    const v1_iface = new ethers.Interface([eventAbis.v1]);
    const v21_iface = new ethers.Interface([eventAbis.v21]);
    const v22_iface = new ethers.Interface([eventAbis.v22]);
    const v23_iface = new ethers.Interface([eventAbis.v23]);

    const v21_logs = await options.getLogs({
        target: FASTLANE_AUCTION_HANDLER_V2,
        eventAbi: eventAbis.v21,
        entireLog: true,
    });
    const v22_logs = await options.getLogs({
        target: FASTLANE_AUCTION_HANDLER_V2,
        eventAbi: eventAbis.v22,
        entireLog: true,
    });
    const v23_logs = await options.getLogs({
        target: FASTLANE_AUCTION_HANDLER_V2,
        eventAbi: eventAbis.v23,
        entireLog: true,
    });

    for (const log of v1_logs) {
        const parsedLog = v1_iface.parseLog(log)
        dailyFees.addGasToken(parsedLog!.args.amount);
    }
    for (const log of v21_logs) {
        const parsedLog = v21_iface.parseLog(log)
        dailyFees.addGasToken(parsedLog!.args.bidAmount);
    }
    for (const log of v22_logs) {
        const parsedLog = v22_iface.parseLog(log)
        dailyFees.addGasToken(parsedLog!.args.bidAmount);
    }
    for (const log of v23_logs) {
        const parsedLog = v23_iface.parseLog(log)
        dailyFees.addGasToken(parsedLog!.args.amount);
    }

    return { dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.POLYGON]: {
            fetch,
            start: '2022-12-08',
        },
    },
    methodology: {
        Fees: "MEV fees paid by searchers to validators for priority transaction inclusion (bundles) on the Polygon network.",
    }
};

export default adapter;
