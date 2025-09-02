import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKETS = {
    'abstract': '0x3e0F5F8F5Fb043aBFA475C0308417Bf72c463289',
    'linea': '0x39e66ee6b2ddaf4defded3038e0162180dbef340',
};

const MARKET_ACTION_EVENT = 'event MarketActionTx (address indexed user,uint8 indexed action, uint256 indexed marketId, uint256 outcomeId, uint256 shares, uint256 value, uint256 timestamp)';
const MARKET_DATA_FUNCTION = 'function getMarketAltData(uint256 marketId) external view returns(uint256 buyFee, bytes32 questionId ,uint256 questionIdUint,address token,uint256 buyTreasuryFee, address treasury ,address realitio ,uint256 realitioTimeout ,address manager)';

type CallObject = {
    abi: string;
    target: string;
    params: string[];
};

const feeRate = 0.03; //3%

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const markets = await options.api.call({
        abi: 'uint256[]:getMarkets',
        target: MARKETS[options.chain]
    });

    const calls: CallObject[] = [];

    for (const marketId of markets) {
        calls.push({
            abi: MARKET_DATA_FUNCTION,
            target: MARKETS[options.chain],
            params: [marketId]
        });
    };
    const marketData = await options.api.batchCall(calls);

    const tradeLogs = await options.getLogs({
        target: MARKETS[options.chain],
        eventAbi: MARKET_ACTION_EVENT,
    });

    tradeLogs.forEach(trade => {
        const action = trade.action;
        const tradeValue = trade.value;
        const marketId = trade.marketId;
        const marketToken = marketData[marketId].token;

        if (action == 0 || action == 1)
            dailyVolume.add(marketToken, tradeValue);
        if (action == 0)
            dailyFees.add(marketToken, Number(tradeValue) * feeRate);
    });

    const dailyRevenue = dailyFees.clone(1 / 3);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue: dailyRevenue
    };
}

const methodology = {
    Fees: "3% fee charged on buy trades",
    Revenue: "1% fee to fund further development of Myriad Markets",
    ProtocolRevenue: "1% fee to fund further development of Myriad Markets",
    SupplySideRevenue: "1% fee to reward liquidity providers",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.LINEA, CHAIN.ABSTRACT],
    start: "2025-01-21",
    methodology
};

export default adapter;