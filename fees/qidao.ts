import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN, XDAI } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";


type TAddress = {
  [s: string | Chain]: string;
}

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const Vault_Fee_Manager_Contracts: TAddress = {
  [CHAIN.ARBITRUM]: '0xdCC1c692110E0e53Bd57D5B2234867E9C5B98158',
  [CHAIN.POLYGON]: '0x11606d99AD8aAC49E033B14c89552F585028bA7d',
  [CHAIN.OPTIMISM]: '0xbdef6DAD6841aA60Caf462baAee0AA912EeF817A',
  [CHAIN.AVAX]: '0xca3eb45fb186ed4e75b9b22a514ff1d4abadd123',
  [CHAIN.XDAI]: '0xAe09281c842EbfDb2E606F32bd5048183652B4D8'
}

const Performance_Fee_Management_Contracts: TAddress = {
  [CHAIN.ARBITRUM]: '0x580d0B0ed579c22635AdE9C91Bb7A1f0755F9C85',
  [CHAIN.POLYGON]: '0x232627F88a84A657b8A009AC17ffa226a34c9a87',
  [CHAIN.OPTIMISM]: '0x954aC12C339C60EAFBB32213B15af3F7c7a0dEc2',
  // [CHAIN.ETHEREUM]: '0xEd8a2759B0f8ea0f33225C86cB726fa9C6E030A4'
}

const event_fees_withdraw = 'event FeeWithdrawn(address token,uint256 amount)';
const event_token_earned = 'event TokensEarned(address indexed perfToken,address indexed recipient,uint256 amount)';

const topic0_fees_withdraw = '0x78473f3f373f7673597f4f0fa5873cb4d375fea6d4339ad6b56dbd411513cb3f';
const topic0_token_earned = '0x7750c36249a9e8cdc4a6fb8a68035d55429ff67a4db8b110026b1375dd9d380c';

const contract_interface = new ethers.Interface([
  event_fees_withdraw,
  event_token_earned
]);

interface IRAW {
  token: string;
  amount: number;
}


const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
  try {
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const log_withdraw_fees: ILog[] = Vault_Fee_Manager_Contracts[chain] ? (await sdk.getEventLogs({
        target: Vault_Fee_Manager_Contracts[chain],
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0_fees_withdraw]
      })) as ILog[] : [];

      const log_token_earned: ILog[] = Performance_Fee_Management_Contracts[chain] ? (await sdk.getEventLogs({
        target: Performance_Fee_Management_Contracts[chain],
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0_token_earned]
      })) as ILog[] : [];

      const raw_withdraw: IRAW[] = log_withdraw_fees.map((e: ILog) => {
        const value = contract_interface.parseLog(e);
        const token = value!.args.token;
        const amount = Number(value!.args.amount);
        return {
          token: token,
          amount: amount,
        } as IRAW
      })

      const raw_token_earned: IRAW[] = log_token_earned.map((e: ILog) => {
        const value = contract_interface.parseLog(e);
        const token = value!.args.perfToken;
        const amount = Number(value!.args.amount);
        return {
          token: token,
          amount: amount,
        } as IRAW
      })

      const coins = [...new Set([...raw_withdraw,...raw_token_earned].map((e: IRAW) => `${chain}:${e.token}`.toLowerCase()))]
      const prices = await getPrices(coins, timestamp);
      const dailyFeesUSD = [...raw_withdraw, ...raw_token_earned].map((e: IRAW) => {
        const price = (prices[`${chain}:${e.token}`.toLowerCase()]?.price || 0);
        const decimals = (prices[`${chain}:${e.token}`.toLowerCase()]?.decimals || 0);
        return (Number(e.amount) / 10 ** decimals) * price;
      }).reduce((a: number, b: number) => a+b, 0)
      const dailyFees = dailyFeesUSD;
      const dailyRevenue = dailyFees * .5;
      const totalSupplySideRevenue = dailyFees * .5;
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        dailyHoldersRevenue: `${dailyRevenue}`,
        dailySupplySideRevenue: `${totalSupplySideRevenue}`,
        timestamp
      }
    } catch (error) {
      console.log(error)
      throw error;
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1691193600,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1691193600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async () => 1691193600,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async () => 1691193600,
    },
    [CHAIN.XDAI]: {
      fetch: fetch(CHAIN.XDAI),
      start: async () => 1691193600,
    },
  }
};

export default adapter;
