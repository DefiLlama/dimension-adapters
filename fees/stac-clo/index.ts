import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

const chainConfig = {
    [CHAIN.ETHEREUM]: {
        start: '2025-10-29',
        token: '0x51C2d74017390CbBd30550179A16A1c28F7210fc',
    }
}

const priceFeed = "0xEdC6287D3D41b322AF600317628D7E226DD3add4"
const tokenDecimals = 6;
const REDSTONE_ORACLE_DECIMALS = 8;
const MANAGEMENT_FEE = 0.3 / 100;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

async function prefetch(options: FetchOptions) {
    const priceBefore = await options.fromApi.call({
        target: priceFeed,
        abi: 'function latestAnswer() view returns (int256)',
        chain:"ethereum",
    })

    const priceAfter = await options.toApi.call({
        target: priceFeed,
        abi: 'function latestAnswer() view returns (int256)',
        chain: "ethereum",
    })

    return {
        priceChange: (priceAfter - priceBefore) / (10 ** REDSTONE_ORACLE_DECIMALS),
        currentPrice: priceAfter / (10 ** REDSTONE_ORACLE_DECIMALS),
    }
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const priceChange = options.preFetchedResults.priceChange;
    const currentPrice = options.preFetchedResults.currentPrice;

    const totalSupply = await options.api.call({
        target: chainConfig[options.chain].token,
        abi: 'function totalSupply() view returns (uint256)',
    })

    const totalSupplyAfterDecimals = totalSupply / (10 ** tokenDecimals);

    const managementFeesForPeriod = currentPrice * totalSupplyAfterDecimals * MANAGEMENT_FEE * (options.toTimestamp - options.fromTimestamp) / ONE_YEAR_IN_SECONDS;
    const yieldForPeriod = priceChange * totalSupplyAfterDecimals;

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
    Fees: "Increase yields calculated from STAC CLO price change and 0.3% management fees",
    Revenue: "Includes 0.3% management fees collected by the protocol",
    ProtocolRevenue: "Includes 0.3% management fees collected by the protocol",
    SupplySideRevenue: "Includes yields calculated from STAC CLO price change",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Increase yields calculated from STAC CLO price change",
        [METRIC.MANAGEMENT_FEES]: "0.3% management fees collected by the protocol",
    },
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: "0.3% management fees collected by the protocol",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "0.3% management fees collected by the protocol",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Increase yields calculated from STAC CLO price change",
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