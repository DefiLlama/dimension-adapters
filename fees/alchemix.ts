import type { FetchOptions, } from "../adapters/types";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { METRIC } from "../helpers/metrics";
const axios = require('axios');

type IRecipient = {
  [chain: string]: string;
};

type IRes = {
  to: string,
  date: string,
  token: string,
  category: string,
  usdValue: string
  tokenAmount: string
}

const pinataApiKey: string = getEnv('ALCHEMIX_KEY')
const pinataApiSecret: string = getEnv('ALCHEMIX_SECRET')
const ipfs: string = 'https://ipfs.imimim.info/ipfs/'

const CONFIG: IRecipient = {
  [CHAIN.ETHEREUM]: '0x8392..e225',
  [CHAIN.OPTIMISM]: '0xC224..A94a',
  [CHAIN.ARBITRUM]: '0x7e10..A043'
}

async function getPinataHash(pinataFileName: string): Promise<string> {
  const requestHeaders = {
    "Content-Type": "application/json",
    "pinata_api_key": pinataApiKey,
    "pinata_secret_api_key": pinataApiSecret
};

  const findFileString1 = "https://api.pinata.cloud/data/pinList?includeCount=false&metadata[name]=";
  const findFileString2 = "&status=pinned&pageLimit=1";
  const findFileUrl = findFileString1 + pinataFileName + findFileString2;
  
  const { data } =  await axios.get(findFileUrl, { headers: requestHeaders });
  return data.rows[0].ipfs_pin_hash;
}

const timestampToDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
};

const fetch = async (timestamp: number, _: any, { chain, createBalances }: FetchOptions) => {
  const recipient = CONFIG[chain]
  const apiDate = timestampToDate(timestamp)

  const pinataHash = await getPinataHash('den_revenue.json')
  const { data } = await axios.get(ipfs + pinataHash)

  const dataAtApiDate: IRes [] = data.filter((item: any) => item.date === apiDate && item.to === recipient);
  
  const totalFeesUsdValue = dataAtApiDate.reduce((sum, item) => {
    const usdValue = parseFloat(item.usdValue);
    return sum +  usdValue;
  }, 0);

  const dailyFees = createBalances();
  dailyFees.addUSDValue(totalFeesUsdValue, METRIC.PROTOCOL_FEES);

  return { dailyFees, dailyRevenue: dailyFees }
}

const methodology = {
  Fees: "Alchemix generates revenue from various lending and yield optimization activities across its protocol",
  Revenue: "All protocol revenue is retained by the Alchemix treasury"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Aggregate protocol revenue tracked by Alchemix, including fees from self-repaying loans, yield optimization, and other protocol activities"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Total protocol revenue retained by Alchemix treasury"
  }
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.OPTIMISM],
  start: '2021-02-28',
  methodology,
  breakdownMethodology,
}

export default adapter;

