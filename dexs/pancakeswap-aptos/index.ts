import axios from "axios";
import { BreakdownAdapter, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { getPrices } from "../../utils/prices";
import { CHAIN } from "../../helpers/chains";

interface ISwapEventData {
  type: string;
  amount_x_in: string;
  amount_x_out: string;
  amount_y_in: string;
  amount_y_out: string;
  user: string;
}

const account = '0xc7efb4076dbe143cbcd98cfaaa929ecfc8f299203dfff63b95ccb6bfe19850fa';
const getToken = (i: string) => i.split('<')[1].replace('>', '').split(', ');
const APTOS_PRC = 'https://aptos-mainnet.pontem.network';

const  getResources = async (account: string): Promise<any[]> => {
  const data: any = []
  let lastData: any;
  let cursor
  do {
    let url = `${APTOS_PRC}/v1/accounts/${account}/resources?limit=9999`
    if (cursor) url += '&start=' + cursor
    const res = await axios.get(url)
    lastData = res.data
    data.push(...lastData)
    cursor = res.headers['x-aptos-cursor']
  } while (lastData.length === 9999)
  return data
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const fromTimestamp = timestamp - 86400;
  const toTimestamp = timestamp;
  const account_resource: any[] = (await getResources(account))
  const pools = account_resource.filter(e => e.type?.includes('swap::PairEventHolder'))
    .map((e: any) => {
      const [token0, token1] = getToken(e.type);
      return {
        type: e.type,
        token0,
        token1,
        swap_events: {
          counter: e.data.swap.counter,
          creation_num: e.data.swap.guid.id.creation_num,
        },
        timestamp: e.data.timestamp,
        counter: Number(e.data.swap.counter),
      }
    }).sort((a, b) => b.counter - a.counter)
    const creation_num =  [14,767, 702, 12, 622, 757, 1077, 1092]
    const exlude_user = [
      '0x81f06fb536d97a8dc17b216aceeeab9e2d348347dcecf3601404710b85299921',
      '0x4bec62452ff79010d9d248dc6961d77db00cbedbf690c22a30d923c825c7ac00',
      '0xaab5c469f7f827337d80fb63fe89235f484a252898dc34931096e3c480f4adf5',
      '0x0',
      '0x8b6f920db09391aa521751a10b9225d5ae7b789dc73e270b9b1483c95ada0588',
      '0xa383105db9c9032848c23236fb812d3e990569c658ca60b4e9adb72d1daf4ec6',
      '0x6fe8d6a9c2bae15c093a82cb767fa26e73d1766b75a0eb03394b0cd3c80d1816',
      '0xbdb4fc5a262d5b82d5e4f0a60b88fe04b34518943caf5972ee6a65e86895492c',
      '0x70d2d370d4f17ccb70e4047e4f327550f2bda6c3d20c23225dec4e1005ab8dc1',
      '0x5fbfe849d110feecd7cfbe7529fda2ce691a3ecea08af66851d793180ea01a92',
      '0x67c928210094bec6f61849175ec986e514d5c2dab5ad6c00e0561d0706b0a9d5',
      '0x2389a6fccfb39fff5d07dfe02fe69ea94306b6fc50afb5e6391237ae48f09043'
    ]
    const logs_swap: ISwapEventData[] = (await Promise.all(pools.filter(e => creation_num.includes(Number(e.swap_events.creation_num))).map(p => getSwapEvent(p, fromTimestamp, toTimestamp)))).flat()
    const numberOfTrade: any = {};
    // debugger
    [...new Set(logs_swap.map(e => e.user))].forEach(e => {
      numberOfTrade[e] = {};
      numberOfTrade[e]['user'] = e;
      numberOfTrade[e]['count'] = 0;
      numberOfTrade[e]['volume'] = 0;
    })
    const coins = [...new Set([...logs_swap.map(p => getToken(p.type)).flat().map((e: string) => `${CHAIN.APTOS}:${e}`)])]
    const price = (await getPrices(coins, timestamp));
    const untrackVolume: number[] = logs_swap.filter(e => !exlude_user.includes(e.user)).map((e: ISwapEventData) => {
      const [token0, token1] = getToken(e.type);
      const token0Price = price[`${CHAIN.APTOS}:${token0}`]?.price || 0;
      const token1Price = price[`${CHAIN.APTOS}:${token1}`]?.price || 0;
      const token0Decimals = price[`${CHAIN.APTOS}:${token0}`]?.decimals || 0;
      const token1Decimals = price[`${CHAIN.APTOS}:${token1}`]?.decimals || 0;
      if (token0Decimals === 0 || token1Decimals === 0) return 0;
      const in_au = ((Number(e.amount_x_in) + Number(e.amount_x_out)) / 10 ** token0Decimals) * token0Price;
      const out_au = ((Number(e.amount_y_in) + Number(e.amount_y_out)) / 10 ** token1Decimals) * token1Price;
      numberOfTrade[e.user]['count'] += 1
      numberOfTrade[e.user]['volume'] += token0Price ? in_au : out_au;
      return token0Price ? in_au : out_au;
    })
    const dailyVolume = [...new Set(untrackVolume)].reduce((a: number, b: number) => a + b, 0)

  return {
    timestamp,
    dailyVolume: dailyVolume.toString(),
  }
}

const getSwapEvent = async (pool: any, fromTimestamp: number, toTimestamp: number): Promise<ISwapEventData[]> => {
  const limit = 100;
  const swap_events: any[] = [];
  let start = (pool.swap_events.counter - limit) < 0 ? 0 : pool.swap_events.counter - limit;
  while (true) {
    if (start < 0) break;
    const getEventByCreation = `${APTOS_PRC}/v1/accounts/${account}/events/${pool.swap_events.creation_num}?start=${start}&limit=${limit}`;
    try {
      const event: any[] = (await axios.get(getEventByCreation)).data;
      const listSequence: number[] = event.map(e =>  Number(e.sequence_number))
      const lastMin = Math.min(...listSequence)
      if (lastMin >= Infinity || lastMin <= -Infinity) break;
      const lastVision = event.find(e => Number(e.sequence_number) === lastMin)?.version;
      const urlBlock = `${APTOS_PRC}/v1/blocks/by_version/${lastVision}`;
      const block = (await axios.get(urlBlock)).data;
      const lastTimestamp = toUnixTime(block.block_timestamp);
      const lastTimestampNumber = lastTimestamp
      if (lastTimestampNumber >= fromTimestamp && lastTimestampNumber <= toTimestamp)  {
        swap_events.push(...event)
      }
      if (lastTimestampNumber < fromTimestamp) {
        break;
      }
      if (start === 0) break;
      start = lastMin - (limit + 1) > 0 ? lastMin - (limit + 1) : 0;
    } catch (e: any) {
      break;
      // start = start - 26 > 0 ? start - 26 : 0;
    }
  }
  return swap_events.map(e => {
    return {
      ...e,
      type: e.type,
      ...e.data
    }
  })
}
const toUnixTime = (timestamp: string) => Number((Number(timestamp)/1e6).toString().split('.')[0])

const adapters: BreakdownAdapter = {
  breakdown: {
    v2: {
      [CHAIN.APTOS]: {
        fetch: fetchVolume,
        start: async () => 1633065600,
        runAtCurrTime: true
      }
    }
  }
}

export default adapters
