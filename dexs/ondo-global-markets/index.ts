import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const TRADE_EXECUTED_ABI = "event TradeExecuted (uint256 executionId, uint256 attestationId, uint256 chainId, bytes32 userId, uint8 side, address asset, uint256 price, uint256 quantity, uint256 expiration, bytes32 additionalData)";

const chainConfig = {
    [CHAIN.ETHEREUM]: {
        contract: '0x2c158BC456e027b2AfFCCadF1BDBD9f5fC4c5C8c',
        start: '2025-07-15',
    },
    [CHAIN.BSC]: {
        contract: '0x91f8Aff3738825e8eB16FC6f6b1A7A4647bDB299',
        start: '2025-10-09',
    },
}

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const trades = await options.getLogs({
        target: chainConfig[options.chain].contract,
        eventAbi: TRADE_EXECUTED_ABI,
    });

    trades.forEach((trade: any) => {
        dailyVolume.addUSDValue((Number(trade.quantity) / 1e18) * (Number(trade.price) / 1e18));
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
    chains: [CHAIN.ETHEREUM, CHAIN.BSC],
    adapter: chainConfig,
    methodology,
};

export default adapter;
