import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { abi } from "./abi";

const BOROS_FACTORY = '0x3080808080Ee6a795c1a6Ff388195Aa5F11ECeE0';
const AMM_CREATION_FACTORY = '0x3205e972714B52512c837AE6f5FCFDeB07f0f23C';
const TOPICS = {
    LIMIT_ORDER_PLACED: '0x7a1823ff8473ae353f7ac7587b085e7544b1e3cc8f87c33c504af60fe5111471',
    PARTIALLY_FILLED: '0x48dc6d310fa6f4ef65aacba36e1aad2df2296c7024eb71845d8e2b7c76c6e852',
    LIMIT_ORDER_CANCELED: '0x2c85ce2db412cbd774172130804b8f3851259af67fb84249f5d0254031be8116'
};
const firstMarketCreationBlock = 362039621; // 2025-07-27

interface BorosMarket {
    address: string;
    symbol: string;
    maturity: number;
};

const marketsRecord: Record<string, BorosMarket> = {};

const SYMBOL_TO_CGID = {
    'ETH': 'ethereum',
    'BTC': 'bitcoin',
};

const getCgId = (marketSymbol: string, marketType: string) => {
    const symbolPosition = marketType === 'orderbook' ? 1 : 2;
    let symbol = "";
    try {
        symbol = marketSymbol.split("-")[symbolPosition].replace("USDT", "");
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

    for (const marketLog of marketCreationLogs) {
        const market: BorosMarket = {
            address: marketLog.market,
            symbol: marketLog.immData.symbol,
            maturity: Number(marketLog.immData.k_maturity),
        };
        marketsRecord[market.address] = market;
        if (market.maturity < options.fromTimestamp) continue;
        const cgId = getCgId(market.symbol, 'orderbook');
        if (!cgId) continue;

        const orderFilledLogs = await options.getLogs({
            target: market.address,
            eventAbi: abi.ORDER_FILLED_EVENT,
        });
        let filledOrders: bigint[] = [];
        orderFilledLogs.forEach((order: [bigint, bigint]) => {
            for (let i = order[0]; i <= order[1]; i++) {
                filledOrders.push(i);
            }
        });
        if (filledOrders.length == 0) continue;
        const decimalOrderIds = filledOrders.map(id => `CAST('${id}' AS DECIMAL(38,0))`).join(', ');

        const duneQuery = getSqlFromFile('helpers/queries/boros.sql', {
            initialBlock: firstMarketCreationBlock, address: market.address, decimalOrderIds, orderPlacedTopic: TOPICS.LIMIT_ORDER_PLACED, partiallyFilledTopic: TOPICS.PARTIALLY_FILLED, orderCanceledTopic: TOPICS.LIMIT_ORDER_CANCELED, startTimestamp: options.fromTimestamp, endTimestamp: options.toTimestamp
        });
        const res = await queryDuneSql(options, duneQuery);
        const executedOrderSize = res.length > 0 ? res[0].executed_order_size : 0;
        dailyVolume.addCGToken(cgId, executedOrderSize);

        const marketOrderFilledLogs = await options.getLogs({
            target: market.address,
            eventAbi: abi.MARKET_ORDERS_FILLED_EVENT,
        });
        marketOrderFilledLogs.forEach(trade => {
            dailyFees.addCGToken(cgId, Number(trade.totalFees) / 1e18);
        })

        const otcSwapLogs = await options.getLogs({
            target: market.address,
            eventAbi: abi.OTC_SWAP_EVENT,
        });
        otcSwapLogs.forEach(trade => {
            dailyFees.addCGToken(cgId, Number(trade.otcFee) / 1e18);
            dailySupplySideRevenue.addCGToken(cgId, Number(trade.otcFee) / 1e18)
        })

        const paymentSettlementLogs = await options.getLogs({
            target: market.address,
            eventAbi: abi.PAYMENT_FROM_SETTLEMENT_EVENT,
        });
        paymentSettlementLogs.forEach(settlement => {
            dailyFees.addCGToken(cgId, Number(settlement.fees) / 1e18);
        });
    };
    const ammCreationLogs = await options.getLogs({
        target: AMM_CREATION_FACTORY,
        eventAbi: abi.AMM_CREATION_EVENT,
        fromBlock: firstMarketCreationBlock
    });

    for (const ammLog of ammCreationLogs) {
        const parentMarket = ammLog.createParams.market;
        const maturity = marketsRecord[parentMarket]?.maturity;
        if (!maturity || maturity < options.fromTimestamp) continue;
        const address = ammLog.amm;
        const ammTradeLogs = await options.getLogs({
            target: address,
            eventAbi: abi.SWAP_EVENT,
        });

        if (ammTradeLogs.length == 0) continue;
        const cgId = getCgId(ammLog.createParams.symbol, 'amm');
        if (!cgId) continue;
        ammTradeLogs.forEach(trade => {
            const swapAmount = trade[0] > 0 ? trade[0] : -trade[0];
            dailyVolume.addCGToken(cgId, swapAmount / BigInt(1e18));
        });
    }

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