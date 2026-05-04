import fetchURL from "../../utils/fetchURL";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryDuneSql } from "../../helpers/dune";

const NAV_API = "https://core.api.onre.finance/data/nav";

interface NAVEntry {
    net_asset_value_date: string;
    net_asset_value: string;
    assets_under_management: string | null;
    circulating_supply: string | null;
}

const formatUTCDate = (ts: number): string => {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
    }).format(ts * 1000);
};

const ONYC_TOKEN_MINT = '5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5';
const REDEEM_FEE = 0.25 / 100;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const response = await fetchURL(NAV_API);
    const navData: NAVEntry[] = response.data;

    const todayDateString = formatUTCDate(options.startOfDay);
    const yesterdayDateString = formatUTCDate(options.startOfDay - 86400);
    const todaysData = navData.find((e) => e.net_asset_value_date === todayDateString);
    const yesterdaysData = navData.find((e) => e.net_asset_value_date === yesterdayDateString);

    if (!todaysData || !yesterdaysData || !todaysData.circulating_supply) {
        throw new Error(`No data found for ${options.dateString}`);
    }

    const todaysNAV = parseFloat(todaysData.net_asset_value);
    const yesterdaysNAV = parseFloat(yesterdaysData.net_asset_value);
    const circulatingSupply = parseFloat(todaysData.circulating_supply);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(circulatingSupply * (todaysNAV - yesterdaysNAV), METRIC.ASSETS_YIELDS);

    const duneQuery = `
        SELECT
            COALESCE(SUM(amount_usd), 0) AS onyc_redeemed_amount_usd
        FROM tokens_solana.transfers
        WHERE action = 'burn'
            AND token_mint_address = '${ONYC_TOKEN_MINT}'
            AND TIME_RANGE
    `;

    const queryResult = await queryDuneSql(options, duneQuery);

    dailyFees.addUSDValue(queryResult[0].onyc_redeemed_amount_usd * REDEEM_FEE, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.addUSDValue(queryResult[0].onyc_redeemed_amount_usd * REDEEM_FEE, METRIC.MINT_REDEEM_FEES);

    return {
        dailyFees: dailyFees,
        dailySupplySideRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    Fees: "Includes yield accrued to ONyc token holders as the NAV increases daily and 0.25% fees paid to redeem ONyc tokens.",
    SupplySideRevenue: "Yield accrued to ONyc token holders as the NAV increases daily.",
    Revenue: "0.25% fees paid to redeem ONyc tokens.",
    ProtocolRevenue: "0.25% fees paid to redeem ONyc tokens.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.MINT_REDEEM_FEES]: "0.25% fees paid to redeem ONyc tokens.",
        [METRIC.ASSETS_YIELDS]: "Yield accrued to ONyc token holders as the NAV increases daily.",
    },
    Revenue: {
        [METRIC.MINT_REDEEM_FEES]: "0.25% fees paid to redeem ONyc tokens.",
    },
    ProtocolRevenue: {
        [METRIC.MINT_REDEEM_FEES]: "0.25% fees paid to redeem ONyc tokens.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yield accrued to ONyc token holders as the NAV increases daily.",
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    methodology,
    breakdownMethodology,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: "2025-06-04",
    isExpensiveAdapter: true,
    allowNegativeValue: true,
};

export default adapter;
