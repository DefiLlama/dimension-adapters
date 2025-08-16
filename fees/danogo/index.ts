import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getPrices } from "../../utils/prices";
import fetchURL from "../../utils/fetchURL";
import { DanogoDimensions, DanogoFees } from "./types";

const DANOGO_GATEWAY_ENDPOINT = 'https://danogo-gateway.tekoapis.com/api/v1/defillama-dimensions';
const DANOGO_START_TIMESTAMP = 1685404800 // 30/05/2023
const CARDANO_COIN_ID = "coingecko:cardano";
const ADA_DECIMAL = 6;

const fetchDanogoGatewayData = async (timestamp: number): Promise<DanogoDimensions> => {
    const response = await fetchURL(`${DANOGO_GATEWAY_ENDPOINT}?timestamp=${timestamp}`);

    return response.data;
}

const fetchADAprice = async (timestamp: number) => {
    const price = await getPrices([CARDANO_COIN_ID], timestamp);

    return price[CARDANO_COIN_ID].price;
}

const lovelaceToUSD = (lovelace: string, price: number) => {
    const ada = Number(BigInt(lovelace) * BigInt(100) / BigInt(10 ** ADA_DECIMAL)) / 100

    return (ada * price).toString();
}

const convertDataToUSD = (data: DanogoDimensions, price: number) => {
    const convertedData: DanogoFees = {
        dailyFees: lovelaceToUSD(data.dailyFeesAdaValue, price),
        totalFees: lovelaceToUSD(data.totalFeesAdaValue, price),
    };

    return convertedData;
}

const fetchData = async ({ endTimestamp }: FetchOptions) => {
    const dataPromise = fetchDanogoGatewayData(endTimestamp);
    const adaPricePromise = fetchADAprice(endTimestamp);
    const [data, adaPrice] = await Promise.all([dataPromise, adaPricePromise]);

    return {
        ...convertDataToUSD(data, adaPrice)
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        cardano: {
            fetch: fetchData,
            start: DANOGO_START_TIMESTAMP,
        }
    },
    version: 2,
    methodology: {
        Fees: 'Trading and listing fees paid by users.',
    }
};

export default adapter;
