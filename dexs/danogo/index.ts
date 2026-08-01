import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { DanogoDimensions, } from "./types";

const DANOGO_GATEWAY_ENDPOINT = 'https://danogo-gateway.tekoapis.com/api/v1/defillama-dimensions';
// const DANOGO_START_TIMESTAMP = 1685404800 // 30/05/2023

const fetchDanogoGatewayData = async (options: FetchOptions): Promise<DanogoDimensions> => {
    const response = await fetchURL(`${DANOGO_GATEWAY_ENDPOINT}?timestamp=${options.toTimestamp}`);
    return response.data;
}

const fetch = async (options: FetchOptions) => {
    const { dailyVolumeAdaValue, } = await fetchDanogoGatewayData(options);
    const dailyVolume = options.createBalances();
    dailyVolume.addGasToken(dailyVolumeAdaValue)

    return { dailyVolume };
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.CARDANO],
    fetch,
    start: '2023-05-30',
};

export default adapter;
