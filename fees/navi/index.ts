import {
    Adapter,
    FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const naviApiURL = 'https://open-api.naviprotocol.io/api/internal/defillama/fee';

interface DailyStats {
    fromTimestamp: number,
    toTimestamp: number,
    borrowInterestRevenue: number,
    borrowInterestFee: number,
    borrowRevenue: number,
    flashLoanRevenue: number,
    liquidationRevenue: number,
    naviDailyRevenue: number,
}

const methodology = {
    Fees: 'Interest and fees paid by borrowers',
    Revenue: 'Interest and borrow fees earned by NAVI',
    ProtocolRevenue: 'Interest and borrow fees earned by NAVI',
    SupplySideRevenue: 'The Portion of interest earned by lenders'
}

const fetchNAVIStats = async ({ startTimestamp, createBalances }: FetchOptions) => {
    const url = `${naviApiURL}?fromTimestamp=${startTimestamp}&cf_pass=b35f13a110a4`
    const stats: DailyStats = (await fetchURL(url)).data;

    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const dailySupplySideRevenue = createBalances();

    dailyFees.addUSDValue(stats.borrowInterestFee, METRIC.BORROW_INTEREST);
    dailyFees.addUSDValue(stats.borrowRevenue, 'Borrow Fees');
    dailyFees.addUSDValue(stats.flashLoanRevenue, METRIC.FLASHLOAN_FEES);
    dailyFees.addUSDValue(stats.liquidationRevenue, METRIC.LIQUIDATION_FEES);

    dailyRevenue.addUSDValue(stats.borrowInterestRevenue, METRIC.BORROW_INTEREST);
    dailyRevenue.addUSDValue(stats.borrowRevenue, 'Borrow Fees');
    dailyRevenue.addUSDValue(stats.flashLoanRevenue, METRIC.FLASHLOAN_FEES);
    dailyRevenue.addUSDValue(stats.liquidationRevenue, METRIC.LIQUIDATION_FEES);

    dailySupplySideRevenue.addUSDValue(stats.borrowInterestFee - stats.borrowInterestRevenue, METRIC.BORROW_INTEREST);

    return {
        dailyFees,
        dailySupplySideRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetchNAVIStats,
            start: '2024-03-01',
        },
    },
    methodology,
    breakdownMethodology: {
        Fees: {
            [METRIC.BORROW_INTEREST]: 'Total interest accrued daily by borrowers',
            'Borrow Fees': 'Additional fees charged by NAVI on borrow positions',
            [METRIC.FLASHLOAN_FEES]: 'Fees paid by users executing flash loans',
            [METRIC.LIQUIDATION_FEES]: 'Penalty fees collected when undercollateralized positions are liquidated',
        },
        Revenue: {
            [METRIC.BORROW_INTEREST]: "NAVI protocol's share of the borrow interest paid by borrowers",
            'Borrow Fees': 'Borrow fees retained by the NAVI protocol',
            [METRIC.FLASHLOAN_FEES]: 'Flash loan fees retained by the NAVI protocol',
            [METRIC.LIQUIDATION_FEES]: 'Liquidation penalty fees retained by the NAVI protocol',
        },
        SupplySideRevenue: {
            [METRIC.BORROW_INTEREST]: 'Share of borrow interest distributed to liquidity providers who supply assets to lending pools',
        },
    },
};

export default adapter;