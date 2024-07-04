import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { DanogoDimensions, } from "./types";

const DANOGO_GATEWAY_ENDPOINT = 'https://danogo-gateway.tekoapis.com/api/v1/defillama-dimensions';
const DANOGO_START_TIMESTAMP = 1685404800 // 30/05/2023

const fetchDanogoGatewayData = async (timestamp: number): Promise<DanogoDimensions> => { 
    const response = await fetchURL(`${DANOGO_GATEWAY_ENDPOINT}?timestamp=${timestamp}`);

    return response.data;
}

const fetchData = async (timestamp: number, _:ChainBlocks, { createBalances, }: FetchOptions) => {
    const { dailyVolumeAdaValue, totalFeesAdaValue }= await fetchDanogoGatewayData(timestamp);
    const dailyVolume = createBalances();
    const totalVolume = createBalances();
    dailyVolume.addGasToken(dailyVolumeAdaValue)
    totalVolume.addGasToken(totalFeesAdaValue)

    return {
        timestamp,
        dailyVolume,
        // totalVolume,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        cardano: {
            fetch: fetchData,
            start: DANOGO_START_TIMESTAMP,
            runAtCurrTime: false,
        }
    }
};

export default adapter;
