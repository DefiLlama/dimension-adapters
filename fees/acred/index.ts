import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"
import { getTokenSupply } from "../../helpers/solana";
import * as sdk from "@defillama/sdk";
import fetchURL from "../../utils/fetchURL";

const chainConfig = {
    [CHAIN.ETHEREUM]: {
        start: '2025-10-29',
        token: '0x51C2d74017390CbBd30550179A16A1c28F7210fc',
    },
    [CHAIN.AVAX]: {
        start: '2025-01-29',
        token: '0x7C64925002BFA705834B118a923E9911BeE32875'
    },
    [CHAIN.POLYGON]: {
        start: '2025-01-29',
        token: '0xFCe60bBc52a5705CeC5B445501FBAf3274Dc43D0'
    },
    [CHAIN.APTOS]: {
        start: '2025-01-29',
        token: '0xe528f4df568eb9fff6398adc514bc9585fab397f478972bcbebf1e75dee40a88'
    },
    [CHAIN.INK]: {
        start: '2025-03-17',
        token: '0x53Ad50D3B6FCaCB8965d3A49cB722917C7DAE1F3'
    },
    [CHAIN.SOLANA]: {
        start: '2025-03-20',
        token: 'FubtUcvhSCr3VPXEcxouoQjKQ7NWTCzXyECe76B7L3f8'
    },
    [CHAIN.SEI]: {
        start: '2025-09-24',
        token: '0xf7fa6725183e603059fc23d95735bf67f72b2d78'
    },
}

const priceFeed = '0xD6BcbbC87bFb6c8964dDc73DC3EaE6d08865d51C'
const tokenDecimals = 6;
const REDSTONE_ORACLE_DECIMALS = 8;
const MANAGEMENT_FEE = 0.5 / 100;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const APTOS_API_BASE_URL = 'https://api.mainnet.aptoslabs.com'

async function prefetch(options: FetchOptions) {
    const apiFrom = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp: options.fromTimestamp })
    const apiTo = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp: options.toTimestamp })

    await apiFrom.getBlock()
    await apiTo.getBlock()

    const priceBefore = await apiFrom.call({
        target: priceFeed,
        abi: 'function latestAnswer() view returns (int256)',
    })

    const priceAfter = await apiTo.call({
        target: priceFeed,
        abi: 'function latestAnswer() view returns (int256)',
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

    const tokenAddress = chainConfig[options.chain].token;

    const priceChange = options.preFetchedResults.priceChange;
    const currentPrice = options.preFetchedResults.currentPrice;

    let totalSupplyAfterDecimals = 0;

    if (options.chain === CHAIN.SOLANA) {
        const totalSupply = await getTokenSupply(tokenAddress);
        totalSupplyAfterDecimals = totalSupply
    }
    else if (options.chain === CHAIN.APTOS) {
        const apiResponse = await fetchURL(`${APTOS_API_BASE_URL}/v1/accounts/${tokenAddress}/resource/0x1::fungible_asset::ConcurrentSupply`)
        totalSupplyAfterDecimals = Number(apiResponse.data.current.value) / (10 ** tokenDecimals);
    }
    else {
        const totalSupply = await options.api.call({
            target: tokenAddress,
            abi: 'function totalSupply() view returns (uint256)',
        })
        totalSupplyAfterDecimals = totalSupply / (10 ** tokenDecimals);
    }


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
    Fees: "Increase yields calculated from ACRED price change and 0.5% management fees",
    Revenue: "Includes 0.5% management fees collected by the protocol",
    ProtocolRevenue: "Includes 0.5% management fees collected by the protocol",
    SupplySideRevenue: "Includes yields calculated from ACRED price change",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Increase yields calculated from ACRED price change",
        [METRIC.MANAGEMENT_FEES]: "0.5% management fees collected by the protocol",
    },
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: "0.5% management fees collected by the protocol",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "0.5% management fees collected by the protocol",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Increase yields calculated from ACRED price change",
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