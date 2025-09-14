import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const EVENT_ABI = {
    MARKED: "event Marked (uint8 type, uint256 amount, uint256 fees)",
    STANDARD_REDEMPTION: "event RedeemFinalized (address indexed user, uint256 assets, uint256 fee)",
    FASTLANE_REDEMPTION: "event Redeemed (address indexed user, uint256 shares, uint256 assets, uint256 fee)"
};

const ADDRESSES = {
    TREEHOUSE_ACCOUNTING: "0xb7Ce3cb5Bc5c00cd2f9B39d9b0580f5355535709",
    TREEHOUSE_ETHEREUM: "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8",
    TREEHOUSE_REDEMPTION: "0xcd63a29FAfF07130d3Af89bB4f40778938AaBB85",
    TREEHOUSE_FASTLANE_REDEMPTION: "0x829525417Cd78CBa0f99A8736426fC299506C0d6",
    LIDO_WST_ETHEREUM: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0"
};

async function fetch(_a: any, _b: any, options: FetchOptions) {
    let dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const markedLogs = await options.getLogs({
        target: ADDRESSES.TREEHOUSE_ACCOUNTING,
        eventAbi: EVENT_ABI.MARKED,
    });

    markedLogs.forEach(log => {
        dailySupplySideRevenue.add(ADDRESSES.TREEHOUSE_ETHEREUM, log.amount);
        dailyProtocolRevenue.add(ADDRESSES.TREEHOUSE_ETHEREUM, log.fees);
    });

    const standardRedemptionLogs = await options.getLogs({
        target: ADDRESSES.TREEHOUSE_REDEMPTION,
        eventAbi: EVENT_ABI.STANDARD_REDEMPTION
    });

    standardRedemptionLogs.forEach(log => {
        dailyProtocolRevenue.add(ADDRESSES.TREEHOUSE_ETHEREUM, log.fee)
    });

    const fastlaneRedemptionLogs = await options.getLogs({
        target: ADDRESSES.TREEHOUSE_FASTLANE_REDEMPTION,
        eventAbi: EVENT_ABI.FASTLANE_REDEMPTION
    });

    fastlaneRedemptionLogs.forEach(log => {
        dailyProtocolRevenue.add(ADDRESSES.LIDO_WST_ETHEREUM, log.fee)
    });

    dailyFees = dailySupplySideRevenue.clone();
    dailyFees.add(dailyProtocolRevenue);

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyHoldersRevenue: 0,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    };
}

const methodology = {
    Fees: "Includes Market Effective Yield(MEY) earned by treehouse assets and redemption fee",
    Revenue: "Standard Redemption(7 days waiting) fee of 0.05%,Fastlane redemption fee of 2% and 20% performance fee on MEY",
    ProtocolRevenue: "All the revenue goes to protocol treasury",
    HoldersRevenue: "No fee sharing to holders yet",
    SupplySideRevenue: "MEY earned by treehouse asset holders post performance fee",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'Total market effective yields earned by treehouse strategies',
        [METRIC.MINT_REDEEM_FEES]: 'Standard and fastlane redemption fees',
        [METRIC.PERFORMANCE_FEES]: '20% perfomance fees on MEY only when MEY is positive'
    },
    Revenue: {
        [METRIC.MINT_REDEEM_FEES]: 'Standard and fastlane redemption fees',
        [METRIC.PERFORMANCE_FEES]: '20% perfomance fees on MEY only when MEY is positive'
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: 'Market effective yields post performance fees',
    },
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ETHEREUM],
    methodology,
    breakdownMethodology,
    start: '2024-09-10'
};

export default adapter;