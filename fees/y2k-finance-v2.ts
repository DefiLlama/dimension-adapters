import { Adapter, FetchResultFees } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { getPrices } from "../utils/prices";


const controller_address = '0xC0655f3dace795cc48ea1E2e7BC012c1eec912dC';
const topic0 = '0x4b66c73cef2a561fd3c21c2af17630b43dddcff66e6803219be3989857b29e80';


interface ITx {
  data: string;
  transactionHash: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));

  const logs: ITx[] = (await sdk.api.util.getLogs({
    target: controller_address,
    topic: '',
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0],
    keys: [],
    chain: CHAIN.ARBITRUM
  })).output as ITx[];
  const transactionHash = [...new Set(logs.map((e:ITx) => e.transactionHash.toLowerCase()))]

    const query_tx_ether = `
    SELECT contract_address, raw_amount from arbitrum.core.fact_token_transfers
    WHERE contract_address in ('0x912ce59144191c1204e64559fe8253a0e49e6548', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1')
    and to_address = '0x5c84cf4d91dc0acde638363ec804792bb2108258'
    and tx_hash in (${transactionHash.map((a: string) => `'${a.toLowerCase()}'`).join(',')})
    and BLOCK_NUMBER > ${fromBlock} AND BLOCK_NUMBER < ${toBlock}
  `
  const ether_tx_value: any[] = (await queryFlipside(query_tx_ether));
  const coins = [...new Set(ether_tx_value.map((e: any[]) => `${CHAIN.ARBITRUM}:${e[0]}`))];
  const prices = await getPrices(coins, timestamp);
  const dailyFees = ether_tx_value.map((e: any[]) => {
    const price = prices[`${CHAIN.ARBITRUM}:${e[0]}`].price;
    const decimals = prices[`${CHAIN.ARBITRUM}:${e[0]}`].decimals;
    return (Number(e[1]) / 10 ** decimals) * price;
  }).reduce((a: number, b:number) => a + b, 0)
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyFees}`,
    timestamp
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: async ()  => 1685404800,
    },
  }
}

export default adapter;
