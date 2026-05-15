import { FetchV2, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";
import { CHAIN } from "../../helpers/chains";

export const DELPHI_START = "2026-04-20";
export const USDC = ADDRESSES.gensyn.USDC;

const GATEWAY = "0x4e4e85c52E0F414cc67eE88d0C649Ec81698d700";
const PRECISION = 10n ** 18n;

export const abi = {
    buy: "event GatewayBuy(address indexed marketProxy, address indexed buyer, uint256 indexed outcomeIdx, uint256 tokensIn, uint256 sharesOut)",
    sell: "event GatewaySell(address indexed marketProxy, address indexed seller, uint256 indexed outcomeIdx, uint256 sharesIn, uint256 tokensOut)",
    getMarket: "function getMarket() view returns (tuple(tuple(uint256 outcomeCount,uint256 k,uint256 tradingFee,uint256 tradingDeadline,uint256 settlementDeadline) config,uint256 initialPool,uint256 pool,uint256 tradingFees,uint256 refund,uint256 sumTerm36,uint256 winningOutcomeIdx))",
    tradingFeesRecipientPct: "uint256:TRADING_FEES_RECIPIENT_PCT",
};

const fetch: FetchV2 = async (options) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const buyLogs = await options.getLogs({ target: GATEWAY, eventAbi: abi.buy });
    const sellLogs = await options.getLogs({ target: GATEWAY, eventAbi: abi.sell });

    const marketProxies = Array.from(new Set(
        [...buyLogs, ...sellLogs].map((trade) => trade.marketProxy.toLowerCase())
    ));

    const configs: Record<string, { tradingFee: bigint, recipientPct: bigint }> = {};

    for (const marketProxy of marketProxies) {
        const market = await options.api.call({ target: marketProxy, abi: abi.getMarket });
        const recipientPct = await options.api.call({ target: marketProxy, abi: abi.tradingFeesRecipientPct });
        const config = market.config ?? market[0];
        configs[marketProxy] = {
            tradingFee: BigInt(config.tradingFee ?? config[2]),
            recipientPct: BigInt(recipientPct),
        };
    }

    buyLogs.forEach((buy) => {
        const config = configs[buy.marketProxy.toLowerCase()];
        const tokensIn = BigInt(buy.tokensIn);
        const tradingFee = config.tradingFee;
        const recipientPct = config.recipientPct;

        const netAmount = tokensIn * (PRECISION - tradingFee) / PRECISION;
        const fee = tokensIn - netAmount;

        const revenue = fee * recipientPct / PRECISION;
        const supplySideRevenue = fee - revenue;

        dailyVolume.add(USDC, buy.tokensIn)
        dailyFees.add(USDC, fee, METRIC.TRADING_FEES);
        dailyRevenue.add(USDC, revenue, "Trading Fees To Buyback Vault");
        dailyProtocolRevenue.add(USDC, revenue, "Trading Fees To Buyback Vault");
        dailySupplySideRevenue.add(USDC, supplySideRevenue, "Trading Fees To Market Creator");
    });

    sellLogs.forEach((sell) => {
        const config = configs[sell.marketProxy.toLowerCase()];
        const tokensOut = BigInt(sell.tokensOut);
        const tradingFee = config.tradingFee;
        const recipientPct = config.recipientPct;

        const denominator = PRECISION - tradingFee;
        const grossAmount = (tokensOut * PRECISION + denominator - 1n) / denominator;
        const fee = grossAmount - tokensOut;

        const revenue = fee * recipientPct / PRECISION;
        const supplySideRevenue = fee - revenue;

        dailyVolume.add(USDC, sell.tokensOut)
        dailyFees.add(USDC, fee, METRIC.TRADING_FEES);
        dailyRevenue.add(USDC, revenue, "Trading Fees To Buyback Vault");
        dailyProtocolRevenue.add(USDC, revenue, "Trading Fees To Buyback Vault");
        dailySupplySideRevenue.add(USDC, supplySideRevenue, "Trading Fees To Market Creator");
    });

    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
    Volume: "Cash exchanged across both sides of Delphi prediction markets. Volume is the sum of buy tokens in and sell tokens out.",
    Fees: "Trading fees paid by users when buying or selling Delphi market shares.",
    Revenue: "Protocol share of trading fees sent to the Delphi buyback vault.",
    ProtocolRevenue: "Protocol share of trading fees sent to the Delphi buyback vault.",
    SupplySideRevenue: "Creator share of trading fees accrued at trade time.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users when buying or selling Delphi market shares.",
    },
    Revenue: {
        "Trading Fees To Buyback Vault": "Protocol share of trading fees sent to the Delphi buyback vault.",
    },
    ProtocolRevenue: {
        "Trading Fees To Buyback Vault": "Protocol share of trading fees sent to the Delphi buyback vault.",
    },
    SupplySideRevenue: {
        "Trading Fees To Market Creator": "Creator share of Delphi market trading fees. Fees are accrued at trade time; realized payouts can differ if a market expires.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.GENSYN],
    start: DELPHI_START,
    methodology,
    breakdownMethodology,
};

export default adapter;
