import {SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";

export const TOTAL_FEE = 0.003
export const LP_HOLDERS_FEE = 0.0015

export const getLpFees = (volumeUSD: number) => {
    const totalFees24h = volumeUSD * TOTAL_FEE
    const lpFees24h = volumeUSD * LP_HOLDERS_FEE

    return {
        totalFees24h,
        lpFees24h,
    }
}

const getData = async (from: number, to: number) => {
    const Sonic_LP_V21_QUERY = `
        query pairDayDatas {
            pairDayDatas(
                where: {
                    date_gte: ${from}
                    date_lte: ${to}
                },
                orderBy: date,
                first: 1000,
                skip: 0
            ) {
                id
                date
                token0 {
                    name
                    totalSupply
                }
                token1 {
                    name
                    totalSupply
                }
                dailyVolumeUSD
            }
        }`;


    const responses = [
        await httpPost('https://sonic-graph-b.metropolis.exchange/subgraphs/name/metropolis/sonic-dex-1',
            {query: Sonic_LP_V21_QUERY}
        ),
    ];

    const processDailyData = (data: any) => {
        const volume = parseFloat(data.dailyVolumeUSD || '0');
        const lpFees = getLpFees(volume);
        return {
            holderFees: lpFees.lpFees24h,
            dailyFees: lpFees.totalFees24h,
            volume
        };
    };

    const aggregateMetrics = (dayDatas: any[]) => {
        return dayDatas.reduce((acc, data) => ({
            holderFees: acc.holderFees + processDailyData(data).holderFees,
            dailyFees: acc.dailyFees + processDailyData(data).dailyFees,
            volume: acc.volume + processDailyData(data).volume
        }), { holderFees: 0, dailyFees: 0, volume: 0 });
    };

    const feeData = responses.flat().map(data => data?.data?.pairDayDatas);
    if (feeData.length > 0) {
        const metrics = feeData.reduce((acc, dayDatas) => {
            if (!dayDatas) return acc;
            return aggregateMetrics(dayDatas);
        }, { holderFees: 0, dailyFees: 0, volume: 0 });

        return metrics;
    }

    return {holderFees: 0, dailyFees: 0, volume: 0};
}

export const fetchFee = async (timestamp: number, _block: any, options: FetchOptions) => {
    const data = await getData(options.fromTimestamp, options.toTimestamp);
    if (!data) {
        return {
        }
    }
    return {
        timestamp: timestamp,
        dailyFees: data.dailyFees,
        dailyVolume: data.volume,
    };
};

const methodology = {
    Fees: "Fees generated on each swap at a rate set by the pool.",
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SONIC]: {
            fetch: fetchFee,
            start: "2024-12-16",
        },
    },
    methodology,
};

export default adapter;
