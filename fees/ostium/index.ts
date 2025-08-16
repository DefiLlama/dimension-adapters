import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OSTIUM_TRADING_CALLBACKS = '0x7720fc8c8680bf4a1af99d44c6c265a74e9742a9';
const OSTIUM_PAIR_INFOS = '0x3890243a8fc091c626ed26c087a028b46bc9d66c';

const VAULT_OPENING_FEE_EVENT = 'event VaultOpeningFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const DEV_FEE_EVENT = 'event DevFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const ORACLE_FEE_EVENT = 'event OracleFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const VAULT_LIQ_FEE_EVENT = 'event VaultLiqFeeCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 amount)';
const FEES_CHARGED_EVENT = 'event FeesCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 rolloverFees, int256 fundingFees)';


const fetchFees = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    // Vault Opening Fee (100% MMV)
    const openingFeeLogs = await options.getLogs({
        target: OSTIUM_TRADING_CALLBACKS,
        eventAbi: VAULT_OPENING_FEE_EVENT
    });
    openingFeeLogs.map((log: any) => {
        const fee = Number(log.amount) / 1e6;
        dailyFees.addCGToken("usd-coin", fee);
        dailySupplySideRevenue.addCGToken("usd-coin", fee);
    });

    // Liquidation Fee (100% MMV)
    const liqFeeLogs = await options.getLogs({
        target: OSTIUM_TRADING_CALLBACKS,
        eventAbi: VAULT_LIQ_FEE_EVENT
    });
    liqFeeLogs.map((log: any) => {
        const fee = Number(log.amount) / 1e6;
        dailyFees.addCGToken("usd-coin", fee);
        dailySupplySideRevenue.addCGToken("usd-coin", fee);
    });

    // Oracle Fee (100% protocol)
    const oracleFeeLogs = await options.getLogs({
        target: OSTIUM_TRADING_CALLBACKS,
        eventAbi: ORACLE_FEE_EVENT
    });
    oracleFeeLogs.map((log: any) => {
        const fee = Number(log.amount) / 1e6;
        dailyFees.addCGToken("usd-coin", fee);
        dailyProtocolRevenue.addCGToken("usd-coin", fee);
    });

    // Dev Opening Fee (100% protocol)
    const devFeeLogs = await options.getLogs({
        target: OSTIUM_TRADING_CALLBACKS,
        eventAbi: DEV_FEE_EVENT
    });
    devFeeLogs.map((log: any) => {
        const fee = Number(log.amount) / 1e6;
        dailyFees.addCGToken("usd-coin", fee);
        dailyProtocolRevenue.addCGToken("usd-coin", fee);
    });

    // Rollover Fees (100% MMV)
    const feesChargedLogs = await options.getLogs({
        target: OSTIUM_PAIR_INFOS,
        eventAbi: FEES_CHARGED_EVENT
    });
    feesChargedLogs.map((log: any) => {
        const rolloverFee = Number(log.rolloverFees) / 1e6;
        dailyFees.addCGToken("usd-coin", rolloverFee);
        dailySupplySideRevenue.addCGToken("usd-coin", rolloverFee);
    });

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyUserFees: dailyFees,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    }
}

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "All fees collected from trading, including opening fees, liquidation fees, oracle fees, dev fees, rollover fees",
        ProtocolRevenue: "Protocol revenue consists of 50% of opening fees, 100% of oracle fees and dev fees",
        SupplySideRevenue: "Supply side (MMV) revenue consists of 50% of opening fees, 100% of liquidation fees, rollover fees"
    },
    version: 2,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchFees as any,
            start: '2025-04-16',
        },
    },
}

export default adapter;