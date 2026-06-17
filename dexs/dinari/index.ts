import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
// https://github.com/dinaricrypto/sbt-contracts
// https://github.com/dinaricrypto/sbt-contracts/blob/main/releases/v1.0.0/order_processor.json
// https://github.com/dinaricrypto/sbt-contracts/blob/50f7cb5f0613c03fad42e7ece78e56d2992d03ba/src/orders/OrderProcessor.sol#L652
const config: Record<string, { processor: string; start: string }> = {
    [CHAIN.ETHEREUM]: { processor: "0xA8a48C202AF4E73ad19513D37158A872A4ac79Cb", start: "2024-05-22" },
    [CHAIN.ARBITRUM]: { processor: "0xFA922457873F750244D93679df0d810881E4131D", start: "2024-05-22" },
    [CHAIN.BASE]: { processor: "0x63FF43009f9ba3584aF2Ddfc3D5FE2cb8AE539c0", start: "2024-06-07" },
    [CHAIN.PLUME]: { processor: "0xc1571FEbBb6F8b62eDD0E4694714A382885d6bAB", start: "2025-04-22" },
};

const events = {
    OrderFill: "event OrderFill(uint256 indexed id, address indexed paymentToken, address indexed assetToken, address requester, uint256 assetAmount, uint256 paymentAmount, uint256 feesTaken, bool sell)",
};

const fetch = async (options: FetchOptions) => {
    const { createBalances, getLogs } = options;
    const { processor } = config[options.chain];

    const dailyFees = createBalances();
    const dailyVolume = createBalances();

    const orderFilledLogs = await getLogs({
        target: processor,
        eventAbi: events.OrderFill,
    });

    orderFilledLogs.forEach((log: any) => {
        dailyVolume.add(log.paymentToken, log.paymentAmount);
        dailyFees.add(log.paymentToken, log.feesTaken, METRIC.TRADING_FEES);
    });

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Fees: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares).",
    UserFees: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are paid by users.",
    Revenue: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are revenue.",
    ProtocolRevenue: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) goes to the protocol.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares).",
    },
    UserFees: {
        [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are paid by users.",
    },
    Revenue: {
        [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are revenue.",
    },
    ProtocolRevenue: {
        [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) goes to the protocol.",
    },
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    adapter: config,
    fetch,
    methodology,
    breakdownMethodology,
};

export default adapter;
