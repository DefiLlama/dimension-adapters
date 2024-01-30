import { Chain } from "@defillama/sdk/build/general";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import axios from 'axios';
import { getTimestampAtStartOfDayUTC } from "../utils/date";

type TChainAddress = {
  [s: Chain | string]: string[];
}

const lpTokenAddresses: TChainAddress = {
  [CHAIN.ETHEREUM]: [
    '0xa7062bbA94c91d565Ae33B893Ab5dFAF1Fc57C4d',
    '0x7DBF07Ad92Ed4e26D5511b4F285508eBF174135D'
  ],
  [CHAIN.BSC]: [
    '0x8033d5b454Ee4758E4bD1D37a49009c1a81D8B10',
    '0xf833afA46fCD100e62365a0fDb0734b7c4537811'
  ],
  [CHAIN.POLYGON]: [
    '0x58Cc621c62b0aa9bABfae5651202A932279437DA',
    '0x0394c4f17738A10096510832beaB89a9DD090791',
    '0x4C42DfDBb8Ad654b42F66E0bD4dbdC71B52EB0A6',
  ],
  [CHAIN.ARBITRUM]: [
    '0x690e66fc0F8be8964d40e55EdE6aEBdfcB8A21Df'
  ],
  [CHAIN.AVAX]: [
    '0xe827352A0552fFC835c181ab5Bf1D7794038eC9f'
  ],
  [CHAIN.OPTIMISM]: [
    '0x3B96F88b2b9EB87964b852874D41B633e0f1f68F'
  ],
  [CHAIN.TRON]: [
    'TAC21biCBL9agjuUyzd4gZr356zRgJq61b'
  ]
}

const topic0_swap_fromUSD = '0xfc1df7b9ba72a13350b8a4e0f094e232eebded9edd179950e74a852a0f405112';
const topic0_swap_toUSD = '0xa930da1d3f27a25892307dd59cec52dd9b881661a0f20364757f83a0da2f6873';
const event_swap_fromUSD = 'event SwappedFromVUsd(address recipient,address token,uint256 vUsdAmount,uint256 amount,uint256 fee)';
const event_swap_toUSD = 'event SwappedToVUsd(address sender,address token,uint256 amount,uint256 vUsdAmount,uint256 fee)';

const contract_interface = new ethers.Interface([
  event_swap_fromUSD,
  event_swap_toUSD
]);

const abi_token = "address:token"
const fetchFees = async (chain: Chain, timestamp: number): Promise<number> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24
  const fromBlock = await getBlock(fromTimestamp, chain, {});
  const toBlock = await getBlock(toTimestamp, chain, {});
  const logs_fromUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return sdk.getEventLogs({
      target: lpTokenAddress,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_swap_fromUSD]
    })
  }))).flat();
  const logs_toUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return sdk.getEventLogs({
      target: lpTokenAddress,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_swap_toUSD]
    })
  }))).flat();

  const lptokens = await sdk.api2.abi.multiCall({
    abi: abi_token,
    calls: lpTokenAddresses[chain].map((address: string) => ({
      target: address
    })),
    chain: chain
  });
  const tokens = lptokens;
  const prices = await getPrices(tokens.map((e: any) => `${chain}:${e}`), timestamp);
  const logs = logs_fromUSD.concat(logs_toUSD);
  return logs.map((log: any) => {
    const parsedLog = contract_interface.parseLog(log);
    const index = lpTokenAddresses[chain].indexOf(log.address);
    const tokenAdd = tokens[index];
    const price = prices[`${chain}:${tokenAdd}`].price;
    let decimals = prices[`${chain}:${tokenAdd}`].decimals;
    return Number(parsedLog!.args.fee) / 10 ** decimals * price;
  }).reduce((a: number, b: number) => a + b, 0);
};

const fetchFeesTron = async (chain: Chain, timestamp: number): Promise<number> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24
  const minBlockTimestampMs = fromTimestamp * 1000;
  const maxBlockTimestampMs = toTimestamp * 1000;

  const logs_fromUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return getTronLogs(lpTokenAddress, 'SwappedFromVUsd', minBlockTimestampMs, maxBlockTimestampMs);
  }))).flat();
  const logs_toUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return getTronLogs(lpTokenAddress, 'SwappedToVUsd', minBlockTimestampMs, maxBlockTimestampMs);
  }))).flat();
  const logs = logs_fromUSD.concat(logs_toUSD);

  const lptokens = await sdk.api2.abi.multiCall({
    abi: abi_token,
    calls: lpTokenAddresses[chain].map((address: string) => ({
      target: address
    })),
    chain: chain
  });
  const tokens = lptokens;
  const prices = await getPrices(tokens.map((e: any) => `${chain}:${e}`), timestamp);

  return logs.map((log: any) => {
    const index = lpTokenAddresses[chain].indexOf(log.contract_address);
    const tokenAdd = tokens[index];
    const price = prices[`${chain}:${tokenAdd}`].price;
    let decimals = prices[`${chain}:${tokenAdd}`].decimals;
    return Number(log.result.fee) / 10 ** decimals * price;
  }).reduce((a: number, b: number) => a + b, 0);
};

const tronRpc = `https://api.trongrid.io`
const getTronLogs = async (address: string, eventName: string, minBlockTimestamp: number, maxBlockTimestamp: number) => {
  const url = `${tronRpc}/v1/contracts/${address}/events?event_name=${eventName}&min_block_timestamp=${minBlockTimestamp}&max_block_timestamp=${maxBlockTimestamp}&limit=200`;
  const res = await axios.get(url, {});
  return res.data.data;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      let fees = 0;
      if (chain === CHAIN.TRON) {
        fees = await fetchFeesTron(chain, timestamp);
      } else {
        fees = await fetchFees(chain, timestamp);
      }
      const dailyFees = fees;
      const dailyRevenue = dailyFees * 0.2;
      const dailySupplySideRevenue = dailyFees * 0.8;
      return {
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyRevenue.toString(),
        dailySupplySideRevenue: dailySupplySideRevenue.toString(),
        timestamp,
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
  };
};

const meta = {
  methodology: {
    Fees: "A 0.3% fee is charged for token swaps",
    SupplySideRevenue: "A 0.24% of each swap is distributed to liquidity providers",
    Revenue: "A 0.06% of each swap goes to governance",
  }
};

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: async () => 1684022400,
      meta,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async () => 1684022400,
      meta,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1684022400,
      meta,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1687838400,
      meta,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async () => 1698030000,
      meta,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async () => 1702868400,
      meta,
    },
    [CHAIN.TRON]: {
      fetch: fetch(CHAIN.TRON),
      start: async () => 1685109600,
      meta,
    },
  },
};

export default adapters;
