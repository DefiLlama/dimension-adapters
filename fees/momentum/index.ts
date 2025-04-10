import { postURL} from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
    [s: string]: string;
}

const url: IUrl = {
    [CHAIN.SUI]: `https://app.sentio.xyz/api/v1/insights/mmt-finance/clmm-dashboard/query`
}

const options = {
    headers: {
        'Content-Type': 'application/json',
        'api-key': 'sd0mYLVwi9gZx8l0FHryM5pQY5VEbU8RX',
    },
};

const methodology = {
    Fees: 'Swap fees generated by the swap transactions on Momentum.',
    ProtocolRevenue: 'Protocol fees charged from the swap fees.',
};

const buildQueryPayload = (metricName: string, start: number, end: number) => ({
    timeRange: {
        start: start.toString(),
        end: end.toString(),
        step: 3600,
    },
    queries: [
        {
            metricsQuery: {
                query: metricName,
                aggregate: { op: 'SUM' },
            },
            dataSource: 'METRICS',
        },
    ],
});

const extractMetricDelta = (values?: { value: string }[]): number => {
    if (!values || values.length < 2) return 0;
    const begin = Number(values[0].value);
    const end = Number(values[values.length - 1].value);
    return end - begin;
};

const fetch = (chain: Chain) => {
    return async ({startTimestamp, endTimestamp }): Promise<FetchResultV2> => {
        const [feeRes, protocolFeeRes] = await Promise.all([
            postURL(url[chain], buildQueryPayload('FeeUsdCounter', startTimestamp, endTimestamp), 3, options),
            postURL(url[chain], buildQueryPayload('ProtocolFeeUsdCounter', startTimestamp, endTimestamp), 3, options),
        ]);
        const feeValues = feeRes?.results?.[0]?.matrix?.samples?.[0]?.values;
        const protocolFeeValues = protocolFeeRes?.results?.[0]?.matrix?.samples?.[0]?.values;

        const dailyFees = extractMetricDelta(feeValues);
        const protocolFees = extractMetricDelta(protocolFeeValues);

        return {
            dailyFees: dailyFees.toString(),
            dailyRevenue: protocolFees.toString(),
            dailyProtocolRevenue: protocolFees.toString(),
        };
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetch(CHAIN.SUI),
            runAtCurrTime: true,
            start: '2025-03-08',
            meta: {
                methodology,
            },
        }
    },
};

export default adapter;