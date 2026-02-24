import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import axios from "axios";
import { createHmac } from "crypto";
import asyncRetry from "async-retry";
const plimit = require('p-limit');
const limits = plimit(1);

type TChain = {
    [key: string]: number;
};
const CHAINS: TChain = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.BSC]: 56,
    [CHAIN.OKEXCHAIN]: 66,
    [CHAIN.POLYGON]: 137,
    [CHAIN.TRON]: 195,
    [CHAIN.AVAX]: 43114,
    [CHAIN.FANTOM]: 250,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.OPTIMISM]: 10,
    [CHAIN.CRONOS]: 25,
    [CHAIN.SOLANA]: 501,
    // [CHAIN.OSMOSIS]: 706,
    // 10001, "EthereumPoW"
    // [CHAIN.APTOS]: 637,
    //[CHAIN.FLARE]: 14, // broken
    [CHAIN.ERA]: 324,
    // [CHAIN.CONFLUX]: 1030, // Conflux eSpace
    [CHAIN.SUI]: 784,
    //[CHAIN.BITCOIN]: 0, // broken
    [CHAIN.POLYGON_ZKEVM]: 1101,
    // [CHAIN.SEI]: 70000029,
    [CHAIN.LINEA]: 59144,
    [CHAIN.MANTLE]: 5000,
    [CHAIN.BASE]: 8453,
    // [CHAIN.STACKS]: 5757,
    [CHAIN.STARKNET]: 9004,
    [CHAIN.SCROLL]: 534352,
    [CHAIN.XLAYER]: 196,
    [CHAIN.MANTA]: 169,
    [CHAIN.METIS]: 1088,
    [CHAIN.ZETA]: 7000,
    [CHAIN.MERLIN]: 4200,
    [CHAIN.BLAST]: 81457,
    [CHAIN.MODE]: 34443,
    [CHAIN.TON]: 607,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function queryOkxApi(timestamp:string, path:string){
    const [secretKey, passphrase] = getEnv("OKX_API_KEY").split(":")
    
    const data = await asyncRetry(
        async () => {
            const response = await axios.get(`https://www.okx.com${path}`, {
                headers: {
                    'OK-ACCESS-PROJECT': 'be0ee327bbc230c3977c6868a77cd894',
                    'OK-ACCESS-KEY': 'feb1a319-69e0-4c00-96df-d1188d8a616a',
                    'OK-ACCESS-SIGN': createHmac('sha256', secretKey)
                        .update(timestamp + 'GET' + path)
                        .digest('base64'),
                    'OK-ACCESS-PASSPHRASE': passphrase,
                    'OK-ACCESS-TIMESTAMP': timestamp
                }
            });
            
            if (response.data?.data?.volumeUsdLast24hour) {
                return response.data.data.volumeUsdLast24hour;
            } else {
                throw new Error(`Invalid response: no volumeUsdLast24hour found. Response: ${JSON.stringify(response.data)}`);
            }
        },
        {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 5000,
            factor: 2,
        }
    );
    
    await sleep(200)
    return data
}

const fetch = async (_timestampParam: number, block: any, options: FetchOptions) => {
    const timestamp = new Date().toISOString()
    const path = `/api/v5/dex/cross-chain/volume?timestamp=${options.endTimestamp * 1e3}&chainId=${CHAINS[options.chain]}`

    const dailyBridgeVolume = await limits(() => queryOkxApi(timestamp, path))

    return {
        dailyBridgeVolume,
        timestamp: options.endTimestamp,
    };
};

const adapter: any = {
    version: 1, // api supports other timestamps but if you try using current timestamps, it breaks, so sticking to v1 even though it should be able to support v2
    adapter: Object.keys(CHAINS).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: '2022-05-17',
            },
        };
    }, {}),
};

export default adapter;
