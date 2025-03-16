import {SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

const getData = async (chain: string, timestamp: number) => {
    const Sonic_LB_V22_QUERY = `
        query lbpairDayDatas {
            lbpairDayDatas(
                where: {
                    date_gte: ${timestamp - 24 * 3600}
                    date_lte: ${timestamp}
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

    async function fetchLbV22() {
        try {
            const responses = [
                await fetch('https://sonic-graph-b.metropolis.exchange/subgraphs/name/metropolis/sonic-lb-v22', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({query: Sonic_LB_V22_QUERY}),
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

            const feeData = results.flat().map(data => data.data?.lbpairDayDatas);
            if (feeData.length > 0) {
                const {fees, volume} = feeData.reduce((acc, dayDatas) => {
                    if (dayDatas) {
                        return dayDatas.reduce((innerAcc, data) => ({
                            fees: innerAcc.fees + parseFloat(data.feesUSD || '0'),
                            volume: innerAcc.volume + parseFloat(data.volumeUSD || '0')
                        }), acc);
                    }
                    return acc;
                }, {fees: 0, volume: 0});
                return {fees, volume}
            }
        } catch (error) {
            console.error('Error fetching iotaLbV22 data:', error);
            return null;
        }
    }

    return await fetchLbV22()
}

export const fetchFee = (chain: string) => {
    return async (timestamp: number) => {
        const {fees, volume} = await getData(chain, timestamp);
        return {
            timestamp: timestamp,
            dailyFees: fees,
            dailyVolume: volume,
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