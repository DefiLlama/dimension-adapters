import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import asyncRetry from "async-retry";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

/*
 * HbarSuite is a decentralized network of features built on Hedera Hashgraph.
 * It is a suite of products that are built on top of the layer 1, 
 * relying on the security and speed of the Hedera network.
 * 
 * HbarSute Network relies entirely on HCS (Hedera Consensus Service) for its data storage, 
 * and HFS (Hedera File Service) for its file storage.
 * 
 * It also uses NFTs (Non-Fungible Tokens) to represent the Liquidity Providers' shares in the pools, 
 * storing the data on IPFS.
 */

// Listing the urls of the nodes that are used by HbarSuite to connect to the Hedera Mainnet.
const nodes = [
  'https://mainnet-sn1.hbarsuite.network',
  'https://mainnet-sn2.hbarsuite.network',
  'https://mainnet-sn3.hbarsuite.network',
  'https://mainnet-sn4.hbarsuite.network',
  'https://mainnet-sn5.hbarsuite.network',
  'https://mainnet-sn6.hbarsuite.network',
  'https://mainnet-sn7.hbarsuite.network',
  'https://mainnet-sn8.hbarsuite.network'
]

interface IHbarSuiteVolumes {
  allTimeVolume: number
  allTimeVolumesByPools: Array<{
    pool_id: string
    pool_name: string
    volume: number
  }>
  dailyVolumes: Array<{
    timestamp: number
    volume: number
  }>
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  
    // generating a random number, so to grab a random smart-node from the network..
    let randomNode = nodes[Math.floor(Math.random() * nodes.length)];

    // fetching the HBAR price from coingecko..
    let price_feed = await asyncRetry(async() => await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd'
    ));

    let volumes: IHbarSuiteVolumes = (await asyncRetry(async() => await axios.get(
        `${randomNode}/pools/volumes`
    ))).data;

    let dailyVolume = volumes.dailyVolumes.find((volume) => volume.timestamp >= dayTimestamp);

    return {
      totalVolume: (volumes.allTimeVolume * price_feed.data['hedera-hashgraph'].usd).toString(),
      dailyVolume: dailyVolume ? (dailyVolume.volume * price_feed.data['hedera-hashgraph'].usd).toString() : "0",
      timestamp: dayTimestamp
    };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: async () => 1672531200,
    },
  },
};

export default adapter;
