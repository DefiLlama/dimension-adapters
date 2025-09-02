import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKETS = {
    'abstract': [
        '0x3e0F5F8F5Fb043aBFA475C0308417Bf72c463289',
        '0xaeef2840081ead9ddfb2f52cf16c0226320b8c6d',
        '0x4f4988a910f8ae9b3214149a8ea1f2e4e3cd93cc'
    ],
    'linea': ['0x39e66ee6b2ddaf4defded3038e0162180dbef340'],
};
const MARKET_ACTION_EVENT = 'event MarketActionTx (address indexed user,uint8 indexed action, uint256 indexed marketId, uint256 outcomeId, uint256 shares, uint256 value, uint256 timestamp)'

const feeRate = 0.03; //3%

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const tradeLogs = await options.getLogs({
        targets: MARKETS[options.chain],
        eventAbi: MARKET_ACTION_EVENT,
    });

    tradeLogs.forEach(trade => {
        const action = trade.action;
        const tradeValue = trade.value / BigInt(1e6);
        if (action == 0 || action == 1)
            dailyVolume.addUSDValue(tradeValue);
        if (action == 0)
            dailyFees.addUSDValue(Number(tradeValue) * feeRate);
    });
    console.log(tradeLogs.length,dailyVolume);

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