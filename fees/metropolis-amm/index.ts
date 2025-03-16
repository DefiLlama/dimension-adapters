import {SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

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

const getData = async (chain: string, timestamp: number) => {
    const Sonic_LP_V21_QUERY = `
        query pairDayDatas {
            pairDayDatas(
                where: {
                    date_gte: ${timestamp - 24 * 3600}
                    date_lte: ${timestamp}
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

    async function fetchV21() {
        try {
            const responses = [
                await fetch('https://sonic-graph-b.metropolis.exchange/subgraphs/name/metropolis/sonic-dex', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({query: Sonic_LP_V21_QUERY}),
                }),
            ];

            const results = await Promise.all(responses.map(async (response) => {
                if (!response.ok) {
                    let errorText;
                    switch (response.status) {
                        case 400:
                            errorText = await response.text();
                            break;
                        case 401:
                            errorText = 'Unauthorized';
                            break;
                        case 403:
                            errorText = 'Forbidden';
                            break;
                        default:
                            errorText = `HTTP error! status: ${response.status}`;
                    }
                    throw new Error(errorText);
                }

                return response.json();
            }));

            const feeData = results.flat().map(data => data.data?.pairDayDatas);
            if (feeData.length > 0) {
                const {holderFees, dailyFees, volume} = feeData.reduce((acc, dayDatas) => {
                    if (dayDatas) {
                        return dayDatas.reduce((innerAcc, data) => {
                            const lpFees = getLpFees(parseFloat(data.dailyVolumeUSD || '0'))
                            return {
                                holderFees: innerAcc.holderFees + lpFees.lpFees24h,
                                dailyFees: innerAcc.dailyFees + lpFees.totalFees24h,
                                volume: innerAcc.volume + parseFloat(data.dailyVolumeUSD || '0')
                            }
                        }, acc);
                    }
                    return acc;
                }, {holderFees: 0, dailyFees: 0, volume: 0});
                return {holderFees, dailyFees, volume}
            }
        } catch (error) {
            console.error('Error fetching iotaV21 data:', error);
            return null;
        }
    }

    return await fetchV21()
}

export const fetchFee = (chain: string) => {
    return async (timestamp: number) => {
        const data = await getData(chain, timestamp);
        return {
            timestamp: timestamp,
            dailyFees: data.dailyFees,
            dailyVolume: data.volume,
        };
    };
};

const methodology = {
    Fees: "Fees generated on each swap at a rate set by the pool.",
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SONIC]: {
            fetch: fetchFee(CHAIN.SONIC),
            start: "2024-12-16",
            meta: {
                methodology,
            },
        },
    },
};

export default adapter;
