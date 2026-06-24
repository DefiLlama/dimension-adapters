import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"
import * as sdk from "@defillama/sdk"

// Referenced from fees/stac-clo: both adapters use Securitize/RedStone
// price-feed deltas for fund NAV growth plus a prorated annual management fee.
const chainConfig: any = {
    [CHAIN.ETHEREUM]: {
        start: '2025-07-17',
        token: '0xDa2fFA104356688E74D9340519B8C17f00d7752E',
        priceFeed: '0x1f14a50bA904A28CF6088e71B6a15561074398d7',
    },
    [CHAIN.POLYGON]: {
        start: '2025-07-17',
        token: '0x4C5cA366e26409845624E29B62C388a06961A792',
        priceFeed: '0x780fe28dBac08eBa781de833A5E860C86D524251',
    },
    [CHAIN.OPTIMISM]: {
        start: '2025-07-17',
        token: '0x720f86f4B5b5d5d0ea3E5718EC43071d4d05134b',
        priceFeed: '0x85C4F855Bc0609D2584405819EdAEa3aDAbfE97D',
    },
    [CHAIN.PLUME]: {
        start: '2025-07-17',
        token: '0x175c2AbF6DDb7401C4Aaa669cAbdC55E7a5e172a',
        priceFeed: '0x4aF6b78d92432D32E3a635E824d3A541866f7a78',
    },
    [CHAIN.TRON]: {
        start: '2026-04-10',
        // HLSCOPE (symbol HLSCOPE, 6 decimals) TRC-20 token on Tron.
        // Source: https://tronscan.org/#/token20/TSwyYj6zLPLKV6tbFCyTzuEqN7YaTPht1X
        token: 'TSwyYj6zLPLKV6tbFCyTzuEqN7YaTPht1X',
        // Tron has no dedicated RedStone feed (RedStone lists HLSCOPE only on
        // ethereum/polygon/optimism/plume: https://app.redstone.finance/app/feeds/).
        // NAV is chain-independent, so reuse the Ethereum HLSCOPE feed (same address
        // as the CHAIN.ETHEREUM entry above; same approach as acred/vbill).
        priceFeed: '0x1f14a50bA904A28CF6088e71B6a15561074398d7',
        priceFeedChain: CHAIN.ETHEREUM,
    }
}

const tokenDecimals = 6;
const REDSTONE_ORACLE_DECIMALS = 8;
// HLSCOPE's public primary-market page lists a 2% expense ratio.
// Source: https://securitize.io/primary-market/hl-scope
const MANAGEMENT_FEE = 2 / 100;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const MANAGEMENT_FEES_TO_PROTOCOL = `${METRIC.MANAGEMENT_FEES} To Protocol`;
const ASSETS_YIELDS_TO_INVESTORS = `${METRIC.ASSETS_YIELDS} To Investors`;

async function prefetch(options: FetchOptions) {
    const { priceFeed, priceFeedChain } = chainConfig[options.chain];
    const abi = 'function latestAnswer() view returns (int256)';

    let priceBefore: number;
    let priceAfter: number;

    if (priceFeedChain && priceFeedChain !== options.chain) {
        // Chain has no native RedStone feed (e.g. Tron). NAV is chain-independent,
        // so read the feed on its host chain at the matching timestamps.
        const apiFrom = new sdk.ChainApi({ chain: priceFeedChain, timestamp: options.fromTimestamp });
        const apiTo = new sdk.ChainApi({ chain: priceFeedChain, timestamp: options.toTimestamp });
        await apiFrom.getBlock();
        await apiTo.getBlock();
        priceBefore = await apiFrom.call({ target: priceFeed, abi });
        priceAfter = await apiTo.call({ target: priceFeed, abi });
    } else {
        // Each chain has its own Securitize/RedStone price feed, so read the
        // same feed at the start and end blocks for the active chain.
        priceBefore = await options.fromApi.call({ target: priceFeed, abi, chain: options.chain });
        priceAfter = await options.toApi.call({ target: priceFeed, abi, chain: options.chain });
    }

    return {
        priceChange: (priceAfter - priceBefore) / (10 ** REDSTONE_ORACLE_DECIMALS),
        currentPrice: priceAfter / (10 ** REDSTONE_ORACLE_DECIMALS),
    }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
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

    // Fees are gross fund value flow: NAV growth to investors plus the
    // prorated annual management fee charged on AUM.
    dailyFees.addUSDValue(managementFeesForPeriod, METRIC.MANAGEMENT_FEES);
    dailyRevenue.addUSDValue(managementFeesForPeriod, MANAGEMENT_FEES_TO_PROTOCOL);

    // NAV growth is passed through to token holders, so it is counted as
    // supply-side revenue rather than protocol revenue.
    dailyFees.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addUSDValue(yieldForPeriod, ASSETS_YIELDS_TO_INVESTORS);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "Includes yields calculated from HLSCOPE price change and 2% management fees",
    Revenue: "Includes 2% management fees collected by the protocol",
    ProtocolRevenue: "Includes 2% management fees collected by the protocol",
    SupplySideRevenue: "Includes yields calculated from HLSCOPE price change",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Increase yields calculated from HLSCOPE price change",
        [METRIC.MANAGEMENT_FEES]: "2% management fees collected by the protocol",
    },
    Revenue: {
        [MANAGEMENT_FEES_TO_PROTOCOL]: "2% management fees collected by the protocol",
    },
    ProtocolRevenue: {
        [MANAGEMENT_FEES_TO_PROTOCOL]: "2% management fees collected by the protocol",
    },
    SupplySideRevenue: {
        [ASSETS_YIELDS_TO_INVESTORS]: "Increase yields calculated from HLSCOPE price change",
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
