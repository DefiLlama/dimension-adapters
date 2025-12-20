import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { addTokensReceived } from '../../helpers/token';
import { METRIC } from "../../helpers/metrics";

const AUTOFINANCE_API = "https://autopools-api.tokemaklabs.com/api";

const CHAIN_CONFIG: Record<string, any> = {
    [CHAIN.ETHEREUM]: {
        chainId: 1,
        start: '2024-09-10'
    },
    [CHAIN.BASE]: {
        chainId: 8453,
        start: '2024-10-18'
    },
    [CHAIN.SONIC]: {
        chainId: 146,
        start: '2025-06-03'
    },
    [CHAIN.ARBITRUM]: {
        chainId: 42161,
        start: '2025-09-09'
    },
    [CHAIN.PLASMA]: {
        chainId: 9745,
        start: '2025-09-19'
    },
    [CHAIN.LINEA]: {
        chainId: 59144,
        start: '2025-10-23'
    },
}

const ADDRESSES = {
    feeRedeemer: "0xD1057B6C6736bf4f5B4a850Cff02054F1f38e581",
    rewardsDistributor: "0xD69e57336377460707d579CB24f9Ba0aEDf88003",
    tokemakToken: "0x2e9d63788249371f1DFC918a52f8d799F4a38C94"
};

const ABIs = {
    feeSettings: "function getFeeSettings() view returns (tuple(address feeSink, uint256 totalAssetsHighMark,uint256 totalAssetsHighMarkTimestamp, uint256 lastPeriodicFeeTake,uint256 periodicFeeSink, uint256 periodicFeeBps, uint256 streamingFeeBps, uint256 navPerShareLastFeeMark, uint256 navPerShareLastFeeMarkTimestamp, bool rebalanceFeeHighWaterMarkEnabled))",
    convertToAssets: "function convertToAssets(uint256 shares) returns (uint256 assets)",
    totalSupply: "uint256:totalSupply",
    totalAssets: "uint256:totalAssets",
    assetDecimals: 'uint8:decimals'
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const chainId = CHAIN_CONFIG[options.chain].chainId;
    const periodWrtYear = (options.toTimestamp - options.fromTimestamp) / (365 * 24 * 60 * 60);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const { autopools } = await fetchURL(`${AUTOFINANCE_API}/${chainId}/gen3`);
    const autopoolAddresses = autopools.map((autopool: any) => autopool.id);

    const feeDetails = await options.api.multiCall({
        calls: autopoolAddresses,
        abi: ABIs.feeSettings,
        permitFailure: true,
    });

    const totalSupplies = await options.api.multiCall({
        calls: autopoolAddresses,
        abi: ABIs.totalSupply,
        permitFailure: true,
    });

    const totalAssets = await options.api.multiCall({
        calls: autopoolAddresses,
        abi: ABIs.totalAssets,
        permitFailure: true,
    });

    const exchangeRatesBefore = await options.fromApi.multiCall({
        calls: autopoolAddresses.map((address: any) => ({ target: address, params: '1000000000000000000' })),
        abi: ABIs.convertToAssets,
        permitFailure: true,
    });

    const exchangeRatesAfter = await options.toApi.multiCall({
        calls: autopoolAddresses.map((address: any) => ({ target: address, params: '1000000000000000000' })),
        abi: ABIs.convertToAssets,
        permitFailure: true,
    });

    const assetDecimals = await options.api.multiCall({
        calls: autopools.map((autopool: any) => autopool.baseAssetId),
        abi: ABIs.assetDecimals,
        permitFailure: true,
    });

    for (const [index, { baseAssetId }] of autopools.entries()) {
        if (!feeDetails[index] || !totalSupplies[index] || !totalAssets[index] || !exchangeRatesAfter[index] || !exchangeRatesBefore[index] || !assetDecimals[index]) continue;

        const yieldForPeriod = (Number(exchangeRatesAfter[index]) - Number(exchangeRatesBefore[index])) * Number(totalSupplies[index]) / 1e18;

        const managmentFeesForPeriod = Number(totalAssets[index]) * feeDetails[index].periodicFeeBps * periodWrtYear / 100;

        dailyFees.add(baseAssetId, managmentFeesForPeriod, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(baseAssetId, managmentFeesForPeriod, METRIC.MANAGEMENT_FEES);

        const currentNav = +(Number(exchangeRatesAfter[index]) / (10 ** assetDecimals[index])).toFixed(4);
        const isPositivePerformance = (currentNav > feeDetails[index].navPerShareLastFeeMark / 1e4) && (yieldForPeriod > 0);

        const performanceFeesForPeriod = isPositivePerformance ? (yieldForPeriod * feeDetails[index].streamingFeeBps / 100) : 0;

        dailyFees.add(baseAssetId, yieldForPeriod, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(baseAssetId, yieldForPeriod, METRIC.ASSETS_YIELDS);

        dailyFees.add(baseAssetId, performanceFeesForPeriod, METRIC.PERFORMANCE_FEES);
        dailyRevenue.add(baseAssetId, performanceFeesForPeriod, METRIC.PERFORMANCE_FEES);
    }

    const dailyProtocolRevenue = dailyRevenue.clone();

    if (options.chain === CHAIN.ETHEREUM) {
        await addTokensReceived({
            options,
            balances: dailyHoldersRevenue,
            target: ADDRESSES.rewardsDistributor,
            fromAddressFilter: ADDRESSES.feeRedeemer,
            token: ADDRESSES.tokemakToken
        });
        dailyProtocolRevenue.subtract(dailyHoldersRevenue);
    }

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
    }
}

const methodology = {
    Fees: "Includes Yields on all the vaults, performance fees and management fees",
    Revenue: "Performance fees charged on positive performance and management fees if any",
    HoldersRevenue: "Part of revenue going to TOKE stakers through buyback",
    SupplySideRevenue: "Yields on vaults recived by vault token holders",
    ProtocolRevenue: "Revenue apart from buybacks and distributions"
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Yields on vaults through defi strategies",
        [METRIC.PERFORMANCE_FEES]: "Streaming fees applied only on peositive performance fees",
        [METRIC.MANAGEMENT_FEES]: "Managment fees applied on TVL",
    },
    Revenue: {
        [METRIC.PERFORMANCE_FEES]: "Streaming fees applied only on peositive performance fees",
        [METRIC.MANAGEMENT_FEES]: "Managment fees applied on TVL",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yields on vaults through defi strategies",
    },
    HoldersRevenue: {
        [METRIC.MANAGEMENT_FEES]: "Part of management fees going to buyback and distribution",
        [METRIC.PERFORMANCE_FEES]: "Part of performance fees going to buyback and distribution",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "Part of management fees going to protocol",
        [METRIC.PERFORMANCE_FEES]: "Part of performance fees going to protocol",
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    methodology,
    breakdownMethodology,
    adapter: CHAIN_CONFIG,
    allowNegativeValue: true
};

export default adapter;

