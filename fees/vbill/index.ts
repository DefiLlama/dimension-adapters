import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"
import { getTokenSupply } from "../../helpers/solana";
import * as sdk from "@defillama/sdk";

const chainConfig = {
    [CHAIN.ETHEREUM]: {
        start: '2025-05-12',
        token: '0x2255718832bC9fD3bE1CaF75084F4803DA14FF01',
    },
    [CHAIN.AVAX]: {
        start: '2025-05-12',
        token: '0x7F4546eF315Efc65336187Fe3765ea779Ac90183'
    },
    [CHAIN.SOLANA]: {
        start: '2025-05-13',
        token: '34mJztT9am2jybSukvjNqRjgJBZqHJsHnivArx1P4xy1'
    },
    [CHAIN.BSC]: {
        start: '2025-05-12',
        token: '0x14d72634328C4D03bBA184A48081Df65F1911279'
    },
}

const priceFeed = '0x5cC480aeCAd8F52ebd25b9B427737e401E47e8B0'
const tokenDecimals = 6;
const MANAGEMENT_FEE = 0.2 / 100;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const REDSTONE_ORACLE_DECIMALS = 8;

async function prefetch(options: FetchOptions) {
    const apiTo = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp: options.toTimestamp })
    await apiTo.getBlock()

    const dailyYieldPercentage = await apiTo.call({
        target: priceFeed,
        abi: 'function latestAnswer() view returns (int256)',
    })

    return {
        dailyYieldPercentage: dailyYieldPercentage / (10 ** REDSTONE_ORACLE_DECIMALS),
    }
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const tokenAddress = chainConfig[options.chain].token;

    const dailyYieldPercentage = options.preFetchedResults.dailyYieldPercentage;
    const currentPrice = 1;

    let totalSupplyAfterDecimals = 0;

    if (options.chain === CHAIN.SOLANA) {
        const totalSupply = await getTokenSupply(tokenAddress);
        totalSupplyAfterDecimals = totalSupply
    }
    else {
        const totalSupply = await options.api.call({
            target: tokenAddress,
            abi: 'function totalSupply() view returns (uint256)',
        })
        totalSupplyAfterDecimals = totalSupply / (10 ** tokenDecimals);
    }


    const managementFeesForPeriod = currentPrice * totalSupplyAfterDecimals * MANAGEMENT_FEE * (options.toTimestamp - options.fromTimestamp) / ONE_YEAR_IN_SECONDS;
    const yieldForPeriod = dailyYieldPercentage * totalSupplyAfterDecimals * (options.toTimestamp - options.fromTimestamp) / ONE_DAY_IN_SECONDS;

    dailyFees.addUSDValue(managementFeesForPeriod, METRIC.MANAGEMENT_FEES);
    dailyRevenue.addUSDValue(managementFeesForPeriod, METRIC.MANAGEMENT_FEES);

    dailyFees.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "Increase yields calculated from VBill daily yield percentage and 0.2% management fees",
    Revenue: "Includes 0.2% management fees collected by the protocol",
    ProtocolRevenue: "Includes 0.2% management fees collected by the protocol",
    SupplySideRevenue: "Includes yields calculated from VBill daily yield percentage",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Increase yields calculated from VBill daily yield percentage",
        [METRIC.MANAGEMENT_FEES]: "0.2% management fees collected by the protocol",
    },
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: "0.2% management fees collected by the protocol",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "0.2% management fees collected by the protocol",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Increase yields calculated from VBill daily yield percentage",
    },
}

const adapter: SimpleAdapter = {
    version: 1, //price updates once a day
    prefetch,
    fetch,
    breakdownMethodology,
    methodology,
    adapter: chainConfig,
    allowNegativeValue: true,
}

export default adapter;