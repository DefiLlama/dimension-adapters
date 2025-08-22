import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import asyncRetry from "async-retry";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
const BigNumber = require("bignumber.js");

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
  ticker: string
  pool: string
  daily: string
  total: string
}

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Liquidity Providers earn a fixed APR in HSUITE tokens.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  // generating a random number, so to grab a random smart-node from the network..
  let randomNode = nodes[Math.floor(Math.random() * nodes.length)];

  let volumesForPools: Array<IHbarSuiteVolumes> = (await asyncRetry(async () => await axios.get(
    `${randomNode}/dex/analytics/volumes`
  ))).data;

  let dailyVolumes = volumesForPools.reduce((acc, pool) => {
    acc = new BigNumber(acc).plus(pool.daily);
    return acc;
  }, "0");

  return {
    dailyVolume: dailyVolumes.toString(),
    timestamp: dayTimestamp
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: '2023-01-01',
      runAtCurrTime: true
    },
  },
  methodology,
};

export default adapter;
