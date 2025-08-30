import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { abi } from "./abi";

const BOROS_FACTORY = '0x3080808080Ee6a795c1a6Ff388195Aa5F11ECeE0';
const firstMarketCreationBlock = 362039621; // 2025-07-27
const TWO_128 = 1n << 128n;
const TWO_127 = 1n << 127n;

interface BorosMarket {
    address: string;
    symbol: string;
    maturity: number;
};

const SYMBOL_TO_CGID = {
    'ETH': 'ethereum',
    'BTC': 'bitcoin',
};

const getCgId = (marketSymbol: string) => {
    let symbol = "";
    try {
        symbol = marketSymbol.split("-")[1].replace("USDT", "");
    } catch (error) {
        console.error("Failed to extract base asset from symbol:", symbol, error);
        return null;
    }
    const cgId = SYMBOL_TO_CGID[symbol];
    if (!cgId) {
        console.error("No CG mapping for symbol:", symbol);
        return null;
    }
    return cgId;
}

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const marketCreationLogs = await options.getLogs({
        target: BOROS_FACTORY,
        eventAbi: abi.MARKET_CREATION_EVENT,
        fromBlock: firstMarketCreationBlock
    });
    const markets = marketCreationLogs
        .filter(marketLog => Number(marketLog.immData.k_maturity) >= options.fromTimestamp)
        .map(marketLog => ({
            address: marketLog.market,
            symbol: marketLog.immData.symbol,
            maturity: Number(marketLog.immData.k_maturity),
            cgId: getCgId(marketLog.immData.symbol),
        }))
        .filter(market => market.cgId);

    await Promise.all(markets.map(async (market) => {
        const marketOrderFilledLogs = await options.getLogs({
            target: market.address,
            eventAbi: abi.MARKET_ORDERS_FILLED_EVENT,
        });

        marketOrderFilledLogs.forEach(trade => {
            let tradeAmount = trade.totalTrade >> 128n;
            if (tradeAmount > TWO_127)
                tradeAmount = TWO_128 - tradeAmount;
            dailyVolume.addCGToken(market.cgId, Number(tradeAmount) / 1e18);
            dailyFees.addCGToken(market.cgId, Number(trade.totalFees) / 1e18);
        });

        const otcSwapLogs = await options.getLogs({
            target: market.address,
            eventAbi: abi.OTC_SWAP_EVENT,
        });

        otcSwapLogs.forEach(swap => {
            let tradeAmount = swap.trade >> 128n;
            if (tradeAmount > TWO_127)
                tradeAmount = TWO_128 - tradeAmount;
            dailyVolume.addCGToken(market.cgId, Number(tradeAmount) / 1e18);
            dailyFees.addCGToken(market.cgId, Number(swap.otcFee) / 1e18);
            dailySupplySideRevenue.addCGToken(market.cgId, Number(swap.otcFee) / 1e18)
        })

        const paymentSettlementLogs = await options.getLogs({
            target: market.address,
            eventAbi: abi.PAYMENT_FROM_SETTLEMENT_EVENT,
        });
        paymentSettlementLogs.forEach(settlement => {
            dailyFees.addCGToken(market.cgId, Number(settlement.fees) / 1e18);
        });
    }));
    let dailyRevenue = dailyFees.clone();
    dailyRevenue.subtract(dailySupplySideRevenue);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

const methodology = {
    Fees: "Includes taker fees, swap fees and settlement fees.",
    Revenue: "Taker fees and settlement fees going to the protocol.",
    SupplySideRevenue: "Fees paid to vault liquidity providers.",
    ProtocolRevenue: "Taker fees and settlement fees going to the protocol.",
};

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    version: 2,
    chains: [CHAIN.ARBITRUM],
    start: '2025-07-27',
};

export default adapter;