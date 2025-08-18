import {SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {FetchOptions} from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";

interface DayData {
    feesUSD: string;
    volumeUSD: string;
}

interface MetricsAccumulator {
    fees: number;
    volume: number;
}

const calculateMetrics = (dayDatas: DayData[]): MetricsAccumulator => {
    return dayDatas.reduce((acc, data) => ({
        fees: acc.fees + parseFloat(data.feesUSD || '0'),
        volume: acc.volume + parseFloat(data.volumeUSD || '0')
    }), { fees: 0, volume: 0 });
};

const getData = async (from: number, to: number) => {
    const Sonic_LB_V22_QUERY = `
        query lbpairDayDatas {
            lbpairDayDatas(
                where: {
                    date_gte: ${from}
                    date_lte: ${to}
                },
                orderBy: date,
                first: 1000,
                skip: 0
            ) {
                lbPair {
                name
                id
                feesTokenX
                feesTokenY
                tokenXPriceUSD
                tokenYPriceUSD
            }
            feesUSD
            volumeUSD
            date
          }
        }`;


        const responses = [
            await httpPost('https://sonic-graph-b.metropolis.exchange/subgraphs/name/metropolis/sonic-lb-v22-2-w-v',
                {query: Sonic_LB_V22_QUERY}
            ),
        ];

        const feeData = responses.flat().map(data => data?.data?.lbpairDayDatas);
        if (feeData.length > 0 && feeData[0]) {
            return calculateMetrics(feeData[0]);
        }

    return { fees: 0, volume: 0 };
}

export const fetchFee = async (timestamp: number, _block: any, options: FetchOptions) => {
    const {fees, volume} = await getData(options.fromTimestamp, options.toTimestamp);
    if (!fees || !volume) { throw new Error('No data') }
    return {
        timestamp: timestamp,
        dailyFees: fees,
        dailyVolume: volume,
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