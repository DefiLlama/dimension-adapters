import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { httpPost } from "../../utils/fetchURL";
import { DanogoDimensions, } from "./types";

const DANOGO_GATEWAY_ENDPOINT = 'https://danogo-gateway.api.danogo.io/api/v1/defillama-dimensions';
// const DANOGO_START_TIMESTAMP = 1685404800 // 30/05/2023

// Payment credential of Danogo's pool validator, the one non-deprecated Pool script listed at
// https://dex-indexer.api.danogo.io/api/v1/concentrated/smart-contracts (first transaction 2026-03-10).
// Pools sit at addr1w8vtd879... and at addr1x8vtd879... addresses (same script, plus a stake credential),
// so activity is read by payment credential, not by address.
const DANOGO_POOL_PAYMENT_CREDENTIAL = 'd8b69fc53637bcfadbc4469083f706bc293f4d9d2296646c5ca167bb';

// One transaction at the pool script in the day, or none.
const getPoolScriptTx = async (options: FetchOptions): Promise<string | undefined> => {
    const txs = await httpPost(
        `https://api.koios.rest/api/v1/credential_txs?block_time=gte.${options.fromTimestamp}&block_time=lte.${options.toTimestamp}&select=tx_hash&limit=1`,
        { _payment_credentials: [DANOGO_POOL_PAYMENT_CREDENTIAL] },
    );
    if (!Array.isArray(txs)) throw new Error(`Koios credential_txs: unexpected response ${JSON.stringify(txs)}`);
    return txs[0]?.tx_hash;
}

export const fetchDanogoGatewayData = async (options: FetchOptions): Promise<DanogoDimensions> => {
    const response = await fetchURL(`${DANOGO_GATEWAY_ENDPOINT}?timestamp=${options.toTimestamp}`);
    const data: DanogoDimensions = response?.data;
    const fields: (keyof DanogoDimensions)[] = ['dailyVolumeAdaValue', 'totalVolumeAdaValue', 'dailyFeesAdaValue', 'totalFeesAdaValue'];
    if (response?.code !== 0 || !data || fields.some((field) => typeof data[field] !== 'string' || !/^(0|[1-9]\d*)$/.test(data[field])))
        throw new Error(`Danogo gateway: unexpected response for ${options.dateString}: ${JSON.stringify(response)}`);
    if (data.totalVolumeAdaValue === '0')
        throw new Error(`Danogo gateway has no data for ${options.dateString}`);
    // From 2026-11-19 the gateway answers 0 for each day while the pools keep trading: a zero day is only kept when the pool script did not transact
    if (data.dailyVolumeAdaValue === '0') {
        const tx = await getPoolScriptTx(options);
        if (tx) throw new Error(`Danogo gateway reports 0 volume for ${options.dateString} but the pool script transacted (tx ${tx})`);
    }
    return data;
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
