import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const BOROS_ABIS = {
    MARKET_CREATION_EVENT: 'event MarketCreated(address market,tuple(string name,string symbol,bool k_isIsolatedOnly, uint32 k_maturity,uint16 k_tokenId,uint24 k_marketId,uint8 k_tickStep, uint16 k_iTickThresh) immData, tuple(uint16 maxOpenOrders, address markRateOracle, address fIndexOracle, uint128 hardOICap, uint64 takerFee, uint64 otcFee, tuple(uint64 base,uint64 slope,uint64 feeRate)liqSettings,uint64 kIM, uint64 kMM,uint32 tThresh, uint16 maxRateDeviationFactorBase1e4, uint16 closingOrderBoundBase1e4, int16 loUpperConstBase1e4, int16 loUpperSlopeBase1e4, int16 loLowerConstBase1e4, int16 loLowerSlopeBase1e4, uint8 status, bool useImpliedAsMarkRate) config)',
    MARKET_ORDERS_FILLED_EVENT: 'event MarketOrdersFilled (bytes26 user, uint256 totalTrade, uint256 totalFees)',
    OTC_SWAP_EVENT: 'event OtcSwap (bytes26 user, bytes26 counterParty, uint256 trade, int256 cashToCounter, uint256 otcFee)',
    PAYMENT_FROM_SETTLEMENT_EVENT: 'event PaymentFromSettlement (bytes26 user, uint256 lastFTime, uint256 latestFTime, int256 payment, uint256 fees)',
    LIQUIDATION_EVENT: 'event Liquidate (bytes26 liq, bytes26 vio, uint256 liqTrade, uint256 liqFee)',
}

const BOROS_FACTORY = '0x3080808080Ee6a795c1a6Ff388195Aa5F11ECeE0';
const BOROS_FACTORY_CREATION_BLOCK = 362039621; // 2025-07-27

const TWO_128 = 1n << 128n;
const TWO_127 = 1n << 127n;

interface BorosMarket {
    address: string;
    symbol: string;
    maturity: number;
    coinGeckoId: string;
};

const TOKENID_TO_CGID: Record<number, string> = {
    1: 'bitcoin',
    2: 'ethereum',
    3: 'tether',
    4: 'binancecoin',
};

// AMMConfigUpdated transactions, ignore volume from these transactions
const EXCLUDE_OTC_SWAPS: Array<string> = [
    '0x752eea9b38bb427e10a1ae0b8a55783cd700033c6967ae70590202645a1177ad',
    '0xf8e45548cbf08c48c71d054ce872f7e8cbef6633b45224a28d5c7c5128471856',
]

const getCgId = (tokenId: number): string => {
    const cgId = TOKENID_TO_CGID[tokenId];

    if (!cgId) {
        throw Error(`No CG mapping for tokenId: ${tokenId}`)
    }

    return cgId;
}

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const marketCreationLogs = await options.getLogs({
        target: BOROS_FACTORY,
        eventAbi: BOROS_ABIS.MARKET_CREATION_EVENT,
        cacheInCloud: true,
        fromBlock: BOROS_FACTORY_CREATION_BLOCK
    });

    const markets: Array<BorosMarket> = marketCreationLogs
        .filter(marketLog => Number(marketLog.immData.k_maturity) >= options.fromTimestamp)
        .map(marketLog => ({
            address: marketLog.market,
            symbol: marketLog.immData.symbol,
            maturity: Number(marketLog.immData.k_maturity),
            coinGeckoId: getCgId(marketLog.immData.k_tokenId),
        }))
        .filter(market => market.coinGeckoId);

    await Promise.all(markets.map(async (market) => {
        const marketOrderFilledLogs = await options.getLogs({
            target: market.address,
            eventAbi: BOROS_ABIS.MARKET_ORDERS_FILLED_EVENT,
            onlyArgs: false,
        });

        marketOrderFilledLogs.forEach((item: any) => {
            const trade = item.args;

            let tradeAmount = trade.totalTrade >> 128n;
            if (tradeAmount > TWO_127)
                tradeAmount = TWO_128 - tradeAmount;

            dailyVolume.addCGToken(market.coinGeckoId, Number(tradeAmount) / 1e18);

            // add open/close fees
            dailyFees.addCGToken(market.coinGeckoId, Number(trade.totalFees) / 1e18, METRIC.OPEN_CLOSE_FEES);
            dailyRevenue.addCGToken(market.coinGeckoId, Number(trade.totalFees) / 1e18, METRIC.OPEN_CLOSE_FEES);
        });

        const otcSwapLogs = await options.getLogs({
            target: market.address,
            eventAbi: BOROS_ABIS.OTC_SWAP_EVENT,
            onlyArgs: false,
        });

        otcSwapLogs.forEach((item: any) => {
            if (EXCLUDE_OTC_SWAPS.includes(item.transaction_hash)) {
                return;
            }

            const swap = item.args;

            // let tradeAmountAfterFee = swap.trade >> 128n;
            // if (tradeAmountAfterFee > TWO_127)
            //     tradeAmountAfterFee = TWO_128 - tradeAmountAfterFee;

            // don't add volume from otc swap
            // dailyVolume.addCGToken(market.coinGeckoId, (Number(tradeAmountAfterFee) + Number(swap.otcFee)) / 1e18);

            // add swap fees
            dailyFees.addCGToken(market.coinGeckoId, Number(swap.otcFee) / 1e18, METRIC.SWAP_FEES);
            dailySupplySideRevenue.addCGToken(market.coinGeckoId, Number(swap.otcFee) / 1e18, METRIC.SWAP_FEES)
        })

        const paymentSettlementLogs = await options.getLogs({
            target: market.address,
            eventAbi: BOROS_ABIS.PAYMENT_FROM_SETTLEMENT_EVENT,
        });
        paymentSettlementLogs.forEach(settlement => {
            dailyFees.addCGToken(market.coinGeckoId, Number(settlement.fees) / 1e18, METRIC.TRADING_FEES);
            dailyRevenue.addCGToken(market.coinGeckoId, Number(settlement.fees) / 1e18, METRIC.TRADING_FEES);
        });

        const liquidationLogs = await options.getLogs({
            target:market.address,
            eventAbi:BOROS_ABIS.LIQUIDATION_EVENT
        });

        liquidationLogs.forEach((liquidation:any)=>{
            dailyFees.addCGToken(market.coinGeckoId, Number(liquidation.liqFee)/1e18,METRIC.LIQUIDATION_FEES);
            dailyRevenue.addCGToken(market.coinGeckoId, Number(liquidation.liqFee) / 1e18, METRIC.LIQUIDATION_FEES);
        });
    }));

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

const methodology = {
    Fees: "Includes open/close trades fees, swap fees, liquidation and settlement fees.",
    Revenue: "Include open/close fees and settlement fees going to the protocol.",
    SupplySideRevenue: "Swap fees paid to vault liquidity providers.",
    ProtocolRevenue: "Include open/close fees and settlement fees going to the protocol.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Total fees from token swaps.",
        [METRIC.OPEN_CLOSE_FEES]: "Total fees from trading open/close fees.",
        [METRIC.TRADING_FEES]: "Total fees from settlements.",
        [METRIC.LIQUIDATION_FEES]: "Total fees from liquidation events",
    },
    Revenue: {
        [METRIC.OPEN_CLOSE_FEES]: "All fees from trading open/close fees.",
        [METRIC.TRADING_FEES]: "All fees from settlements.",
        [METRIC.LIQUIDATION_FEES]: "Total fees from liquidation events",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "Total fees from token swaps distributed to liquidity providers.",
    },
    ProtocolRevenue: {
        [METRIC.OPEN_CLOSE_FEES]: "All fees from trading open/close fees.",
        [METRIC.TRADING_FEES]: "All fees from settlements.",
        [METRIC.LIQUIDATION_FEES]: "Total fees from liquidation events",
    }
};

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    breakdownMethodology,
    version: 2,
    chains: [CHAIN.ARBITRUM],
    start: '2025-07-27',
};

export default adapter;
