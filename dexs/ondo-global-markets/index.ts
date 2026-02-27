import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const ONDO_MARKET_CONTRACT = '0x2c158BC456e027b2AfFCCadF1BDBD9f5fC4c5C8c';
const TRADE_EXECUTED_ABI = "event TradeExecuted (uint256 executionId, uint256 attestationId, uint256 chainId, bytes32 userId, uint8 side, address asset, uint256 price, uint256 quantity, uint256 expiration, bytes32 additionalData)";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const trades = await options.getLogs({
        target: ONDO_MARKET_CONTRACT,
        eventAbi: TRADE_EXECUTED_ABI,
    });

    trades.forEach((trade: any) => {
        dailyVolume.add(trade.asset, trade.quantity);
    });

    return {
        dailyVolume
    };
}

const methodology = {
    Volume: 'Trade volume of ondo tokenized stocks on ondo global markets exchange'
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2025-07-15',
    methodology,
};

export default adapter;
