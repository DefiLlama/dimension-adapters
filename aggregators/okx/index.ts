import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import axios from "axios";
import { createHmac } from "crypto";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { sleep } from "../../utils/utils";
const plimit = require('p-limit');
const limits = plimit(1);

type TChain = {
  [key: string]: number;
};
const CHAINS: TChain = {
  // evm
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.SONIC]: 146,
  [CHAIN.ERA]: 324,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.POLYGON]: 137,
  [CHAIN.AVAX]: 43114,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BASE]: 8453,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.BLAST]: 81457,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.METIS]: 1088,
  
  // using OKX API
  [CHAIN.FANTOM]: 250,
  [CHAIN.CRONOS]: 25,
  [CHAIN.CONFLUX]: 1030,
  [CHAIN.POLYGON_ZKEVM]: 1101,
  [CHAIN.SEI]: 70000029,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.XLAYER]: 196,
  [CHAIN.MANTA]: 169,
  [CHAIN.ZETA]: 7000,
  [CHAIN.MERLIN]: 4200,
  [CHAIN.MODE]: 34443,
  [CHAIN.TON]: 607,
  [CHAIN.STARKNET]: 9004,
  [CHAIN.STACKS]: 5757,
  [CHAIN.SUI]: 784,
  [CHAIN.APTOS]: 637,
  [CHAIN.SOLANA]: 501,
  [CHAIN.OSMOSIS]: 706,
  [CHAIN.TRON]: 195,

  // [CHAIN.OKEXCHAIN]: 66,
  // [CHAIN.FLARE]: 14, // broken
  // [CHAIN.BITCOIN]: 0, // broken
};

interface ISwapRouter {
  addresses: Array<string>;
}

const SwapRouters: Record<string, ISwapRouter> = {
  [CHAIN.ETHEREUM]: {
    addresses: [
      '0x2E1Dee213BA8d7af0934C49a23187BabEACa8764',
    ],
  },
  [CHAIN.SONIC]: {
    addresses: [
      '0x8feB9E84b7E9DC86adc6cD6Eb554C5B4355c8405',
    ],
  },
  [CHAIN.ERA]: {
    addresses: [
      '0x010BC6B1014E5ed8284ab0667b116AAb99588159',
    ],
  },
  [CHAIN.OPTIMISM]: {
    addresses: [
      '0x86F752f1F662f39BFbcBeF95EE56B6C20d178969',
    ],
  },
  [CHAIN.POLYGON]: {
    addresses: [
      '0xF5402CCC5fC3181B45D7571512999D3Eea0257B6',
    ],
  },
  [CHAIN.BSC]: {
    addresses: [
      '0x6015126d7D23648C2e4466693b8DeaB005ffaba8',
    ],
  },
  [CHAIN.AVAX]: {
    addresses: [
      '0x79f7C6C6dc16Ed3154E85A8ef9c1Ef31CEFaEB19',
    ],
  },
  [CHAIN.ARBITRUM]: {
    addresses: [
      '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801',
    ],
  },
  [CHAIN.LINEA]: {
    addresses: [
      '0x6f7c20464258c732577c87a9B467619e03e5C158',
    ],
  },
  [CHAIN.BASE]: {
    addresses: [
      '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801',
    ],
  },
  [CHAIN.MANTLE]: {
    addresses: [
      '0x69C236E021F5775B0D0328ded5EaC708E3B869DF',
    ],
  },
  [CHAIN.BLAST]: {
    addresses: [
      '0x69C236E021F5775B0D0328ded5EaC708E3B869DF',
    ],
  },
  [CHAIN.UNICHAIN]: {
    addresses: [
      '0x411d2C093e4c2e69Bf0D8E94be1bF13DaDD879c6',
    ],
  },
  [CHAIN.PLASMA]: {
    addresses: [
      '0xd30D8CA2E7715eE6804a287eB86FAfC0839b1380',
    ],
  },
  [CHAIN.METIS]: {
    addresses: [
      '0xcF76984119C7f6ae56fAfE680d39C08278b7eCF4',
    ],
  },
}

async function queryOkxApi(timestamp:string, path:string){
  const [secretKey, passphrase] = getEnv("OKX_API_KEY").split(":")
  const data = await axios.get(`https://www.okx.com${path}`, {
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
  await sleep(200)
  return data
}

const fetch = async (_a: number, _b: any, options: FetchOptions) => {
  if (SwapRouters[options.chain]) {
    const dailyVolume = options.createBalances()
    
    const swapLogs = await options.getLogs({
      targets: SwapRouters[options.chain].addresses,
      eventAbi: 'event OrderRecord(address fromToken, address toToken, address sender, uint256 fromAmount, uint256 returnAmount)',
      flatten: true,
    })
    for (const log of swapLogs) {
      dailyVolume.add(log.fromToken, log.fromAmount);
    }
    
    return { dailyVolume }
  } else {
    // using API
    const timestamp = new Date().toISOString()
    const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay)
    const path = `/api/v5/dex/aggregator/volume?timestamp=${startOfDay* 1e3}&chainId=${CHAINS[options.chain]}`
    const data = await limits(() => queryOkxApi(timestamp, path))
    return {
      dailyVolume: data.data.data.volumeUsdLast24hour,
    };
  }
};

const adapter: any = {
  version: 1, // api supports other timestamps but if you try using current timestamps, it breaks, so sticking to v1 even though it should be able to support v2
  adapter: Object.keys(CHAINS).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch,
        start: '2022-05-17',
      },
    };
  }, {}),
};

export default adapter;
