import { Chain } from "@defillama/sdk/build/general";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";

type TChainAddress = {
  [s: Chain | string]: string[];
}

const lpTokenAddresses: TChainAddress = {
  [CHAIN.ETHEREUM]: [
    '0x7DBF07Ad92Ed4e26D5511b4F285508eBF174135D',
    '0xa7062bbA94c91d565Ae33B893Ab5dFAF1Fc57C4d'
  ],
  [CHAIN.BSC]: [
    '0x8033d5b454Ee4758E4bD1D37a49009c1a81D8B10',
    '0xf833afA46fCD100e62365a0fDb0734b7c4537811'
  ],
  [CHAIN.ARBITRUM]: [
    '0x690e66fc0F8be8964d40e55EdE6aEBdfcB8A21Df'
  ],
  [CHAIN.POLYGON]: [
    '0x0394c4f17738A10096510832beaB89a9DD090791',
    '0x58Cc621c62b0aa9bABfae5651202A932279437DA',
  ]
}

const topic0_swap_fromUSD = '0xfc1df7b9ba72a13350b8a4e0f094e232eebded9edd179950e74a852a0f405112';
const topic0_swap_toUSD = '0xa930da1d3f27a25892307dd59cec52dd9b881661a0f20364757f83a0da2f6873';
const event_swap_fromUSD = 'event SwappedFromVUsd(address recipient,address token,uint256 vUsdAmount,uint256 amount,uint256 fee)';
const event_swap_toUSD = 'event SwappedToVUsd(address sender,address token,uint256 amount,uint256 vUsdAmount,uint256 fee)';

const contract_interface = new ethers.utils.Interface([
  event_swap_fromUSD,
  event_swap_toUSD
]);

interface IFee {
  amount: number;
  lp: string;
}
const abi_token = {
  "inputs": [],
  "name": "token",
  "outputs": [
      {
          "internalType": "contract ERC20",
          "name": "",
          "type": "address"
      }
  ],
  "stateMutability": "view",
  "type": "function"
}

const fetchFees = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 60 * 60 * 24
    try {
      const fromBlock = await getBlock(fromTimestamp, chain, {});
      const toBlock = await getBlock(toTimestamp, chain, {});
      const logs_fromUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
        return sdk.api.util.getLogs({
          target: lpTokenAddress,
          topic: '',
          toBlock: toBlock,
          fromBlock: fromBlock,
          keys: [],
          chain: chain,
          topics: [topic0_swap_fromUSD]
        })
      })))
        .map((p: any) => p)
        .map((a: any) => a.output).flat();
      const logs_toUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
        return sdk.api.util.getLogs({
          target: lpTokenAddress,
          topic: '',
          toBlock: toBlock,
          fromBlock: fromBlock,
          keys: [],
          chain: chain,
          topics: [topic0_swap_toUSD]
        })
      })))
        .map((p: any) => p)
        .map((a: any) => a.output).flat();

      const lptokens = await sdk.api.abi.multiCall({
        abi: abi_token,
        calls: lpTokenAddresses[chain].map((address: string) => ({
          target: address
        })),
        chain: chain
      });
      const tokens = lptokens.output.map((res: any) => res.output);
      const prices = await getPrices(tokens.map((e: any) => `${chain}:${e}`), timestamp);
      const logs = logs_fromUSD.concat(logs_toUSD);
      const fees = logs.map((log: any) => {
        const parsedLog = contract_interface.parseLog(log);
        const index = lpTokenAddresses[chain].indexOf(log.address);
        const tokenAdd = tokens[index];
        const price = prices[`${chain}:${tokenAdd}`].price;
        let decimals = prices[`${chain}:${tokenAdd}`].decimals;
        if (decimals === undefined) decimals = 6;
        return  Number(parsedLog.args.fee._hex) / 10 ** decimals * price;
      }).reduce((a: number, b: number) => a + b, 0);
      const dailyFees = fees;
      const dailyRevenue = fees * 0.1;
      const dailySupplySideRevenue = fees * 0.9;
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
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: async () => 1684022400,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees(CHAIN.BSC),
      start: async () => 1684022400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: async () => 1684022400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: async () => 1684022400,
    },
  },
};

export default adapters;
