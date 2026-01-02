import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OPINION_CONTRACT = "0x5F45344126D6488025B0b84A3A8189F2487a7246";
const ORDER_FILLED_EVENT = "event OrderFilled (bytes32 indexed orderHash,  address indexed maker,address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)";

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const orderFilledLogs = await options.getLogs({
        eventAbi: ORDER_FILLED_EVENT,
        target: OPINION_CONTRACT
    });

    orderFilledLogs.forEach((order: any) => {
        const tradeVolume = Number(order.makerAssetId == 0 ? order.makerAmountFilled : order.takerAmountFilled) / 1e18;
        dailyVolume.addUSDValue(Number(tradeVolume) / 2);
        dailyFees.addUSDValue(Number(order.fee) / 1e18);
    });

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }

}

const methodology = {
    Volume: "Opinion prediction market trading volume",
    Fees: "Taker fees collected by opinion",
    Revenue: "All the fees are revenue",
    ProtocolRevenue: "All the revenue goes to protocol",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    methodology,
    chains: [CHAIN.BSC],
    start: '2025-10-22',
}

export default adapter;