import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

interface FundData {
    expenseRatio: number,
    nav?: number,
    type: 'yield' | 'equity' | 'crypto',
    aum?: number,
    assetClass: 'mutualfunds' | 'etf',
    netYield?: number,
}

//https://www.wisdomtreeconnect.com/digital-funds
//ignore below 2M AUM as it has minimal impact and tradfi data is expensive and can get rate limited

const offChainData: Map<string, FundData> = new Map([
    ["WTGXX", { expenseRatio: 0.25, nav: 1, type: "yield", assetClass: "mutualfunds" }],
    ["SPXUX", { expenseRatio: 0.05, type: "equity", assetClass: "mutualfunds" }],
    ["TECHX", { expenseRatio: 0.1, type: "equity", assetClass: "mutualfunds" }],
    ["BTCW", { expenseRatio: 0.25, type: "crypto", assetClass: "etf" }]
]);

const onchainData: Record<string, Record<string, string>> = {
    [CHAIN.STELLAR]: {
        "WTGX-GDMBNMFJ3TRFLASJ6UGETFME3PJPNKPU24C7KFDBEBPQFG2CI6UC3JG6": "WTGXX",
        "SPXU-GDJBVX3QA5HJPBSAU5VIX2W6MC37NU4UFXPKEGK42SJCYN6AEQ4Z6COM": "SPXUX",
        "TECH-GDSAW27GPR7EWKPTFDPGN2WWZYUHBFKVDBLOUUEKSNKHID4ZWUVOBF5R": "TECHX",
    },
    [CHAIN.ETHEREUM]: {
        "0x1feCF3d9d4Fee7f2c02917A66028a48C6706c179": "WTGXX",
    },
    [CHAIN.ARBITRUM]: {
        "0xFEb26F0943C3885B2CB85A9F933975356c81C33d": "WTGXX",
    },
    [CHAIN.PLUME]: {
        "0xCF7a8813bD3bdAF70A9f46d310Ce1EE8D80a4F5a": "WTGXX"
    }
}

const NASDAQ_API_URL = "https://api.nasdaq.com/api/quote";
const STELLAR_API_URL = "https://api.stellar.expert/explorer/public/asset"
const PYTH_1M_TBILL_YIELD_URL = "https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=0x60076f4fc0dfd634a88b5c3f41e7f8af80b403ca365442b81e582ceb8fc421a2";
const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"
};

async function prefetch(options: FetchOptions): Promise<any> {
    for (const [fund, fundDetails] of offChainData) {
        //For backfilling , the day before which adapter was created
        if (options.startOfDay <= 1765218600) {
            const fetchHistoricNav = async (ticker: string, assetClass: string) => {
                const result = await httpGet(`${NASDAQ_API_URL}/${ticker}/historical?assetclass=${assetClass}&fromdate=${options.dateString}&limit=1`, { headers });
                if (!result || !result.data.tradesTable.rows || result.data.tradesTable.rows.length !== 1) {
                    throw new Error("Fetching nasdaq historic data failed");
                }
                return +result.data.tradesTable.rows[0].close;
            }
            switch (fund) {
                case "WTGXX":
                    //fund started on 7th Nov 2023, so we assume 0 yield before
                    if (options.startOfDay < 1699315200) {
                        fundDetails.netYield = 0;
                        fundDetails.expenseRatio = 0;
                    }
                    else {
                        const yieldSinceInception = 4.7;
                        fundDetails.netYield = yieldSinceInception
                    }
                    break;
                case "SPXUX":
                    const spxUXLatestNav = await fetchHistoricNav(fund, fundDetails.assetClass);
                    fundDetails.nav = spxUXLatestNav;
                    break;
                case "TECHX":
                    const techxLatestNav = await fetchHistoricNav(fund, fundDetails.assetClass);
                    fundDetails.nav = techxLatestNav;
                    break;
                case "BTCW":
                    //fund started on 11th Jan 2024, so we assume 0 aum and expense before
                    if (options.startOfDay < 1704931200) {
                        fundDetails.expenseRatio = 0;
                        fundDetails.aum = 0;
                    }
                    else {
                        const btcwLatestNav = await fetchHistoricNav(fund, fundDetails.assetClass);
                        const outstandingShares = 1_500_000;
                        fundDetails.aum = btcwLatestNav * outstandingShares;
                    }
                    break;
                default:
                    fundDetails.nav = 0;
                    fundDetails.expenseRatio = 0;
                    fundDetails.aum = 0;
                    break;
            }
        }
        else {
            if (!fundDetails.nav && fundDetails.type !== "crypto") {
                const result = await httpGet(`${NASDAQ_API_URL}/${fund}/info?assetclass=${fundDetails.assetClass}`, { headers });
                fundDetails.nav = +(result.data.primaryData.lastSalePrice.slice(1));
            }
            if (fundDetails.type === "yield") {
                const result = await httpGet(PYTH_1M_TBILL_YIELD_URL); //Money market yeilds are almost equivalent to tbill yields
                fundDetails.netYield = result.parsed[0].price.price / 1e8;
            }

            if (fundDetails.type === "crypto") {
                const result = await httpGet(`${NASDAQ_API_URL}/${fund}/summary?assetclass=${fundDetails.assetClass}`, { headers });
                fundDetails.aum = + (result.data.summaryData.MarketCap.value.replaceAll(',', ''));
            }
        }
    }
}

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const durationWrtYear = (options.toTimestamp - options.fromTimestamp) / (365 * 24 * 60 * 60);

    const calculateReturnsOrExpenseForPeriod = (aum: number = 0, annualYieldOrExpense: number = 0) => aum * annualYieldOrExpense * durationWrtYear / 100;

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const calculateFeeAndRevenue = (aum: number, fundDetail: FundData) => {
        if (fundDetail.netYield) {
            const returns = calculateReturnsOrExpenseForPeriod(aum, fundDetail.netYield - fundDetail.expenseRatio)
            dailyFees.addUSDValue(returns, METRIC.ASSETS_YIELDS)
            dailySupplySideRevenue.addUSDValue(returns, METRIC.ASSETS_YIELDS);
        }
        const managementFees = calculateReturnsOrExpenseForPeriod(aum, fundDetail.expenseRatio);
        dailyFees.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
        dailyRevenue.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
    }

    if (options.chain === CHAIN.STELLAR) {
        for (const fundAddress of Object.keys(onchainData.stellar)) {
            const fundDetail = offChainData.get(onchainData.stellar[fundAddress]);
            if (!fundDetail) continue;

            const tokenData = await httpGet(`${STELLAR_API_URL}/${fundAddress}`, { headers });
            const aum = (fundDetail.nav || 0) * tokenData.supply / 1e7;
            calculateFeeAndRevenue(aum, fundDetail);
        }
    }
    else if (options.chain === CHAIN.OFF_CHAIN) {
        [...offChainData.values()].filter(fundDetail => fundDetail.type === "crypto").forEach(fundDetail => {
            calculateFeeAndRevenue(fundDetail.aum!, fundDetail);
        });
    }
    else {
        const fundAddresses = Object.keys(onchainData[options.chain]);
        const totalSupplyArray = await options.api.multiCall({
            calls: fundAddresses,
            abi: 'uint256:totalSupply'
        });

        for (const [i, totalSupply] of totalSupplyArray.entries()) {
            const fundDetail = offChainData.get(onchainData[options.chain][fundAddresses[i]]);
            if (!fundDetail) continue;

            const aum = totalSupply / 1e18 * fundDetail.nav!;
            calculateFeeAndRevenue(aum, fundDetail)
        }
    }
    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue
    }
};

const methodology = {
    Fees: 'Includes yields of Fixed income/Money market funds and management fees of all funds',
    Revenue: 'Management fees of all funds',
    SupplySideRevenue: 'Yields of fixed income/Money market funds received by users',
    ProtocolRevenue: 'All the revenue goes to protocol'
};

const adapter: SimpleAdapter = {
    prefetch,
    fetch,
    adapter: {
        [CHAIN.ARBITRUM]: { start: '2025-01-28' }, [CHAIN.ETHEREUM]: { start: '2024-09-14' },
        [CHAIN.OFF_CHAIN]: { start: '2024-01-11' }, [CHAIN.PLUME]: { start: '2025-10-21' }, [CHAIN.STELLAR]: { start: '2023-01-19' }
    },
    runAtCurrTime: true,
    methodology
}

export default adapter;