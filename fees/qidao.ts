import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
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
  [CHAIN.AVAX]: '0xca3eb45fb186ed4e75b9b22a514ff1d4abadd123',
  [CHAIN.OPTIMISM]: '0xbdef6DAD6841aA60Caf462baAee0AA912EeF817A'
}

const Performance_Fee_Management_Contracts: TAddress = {
  [CHAIN.ARBITRUM]: '0x580d0B0ed579c22635AdE9C91Bb7A1f0755F9C85',
  [CHAIN.POLYGON]: '0x232627F88a84A657b8A009AC17ffa226a34c9a87',
  [CHAIN.OPTIMISM]: '0x954aC12C339C60EAFBB32213B15af3F7c7a0dEc2',
  [CHAIN.ETHEREUM]: '0xEd8a2759B0f8ea0f33225C86cB726fa9C6E030A4'
}

const event_fees_withdraw = 'event FeeWithdrawn( address token,uint256 amount)';
const event_token_earned = 'event TokensEarned( address indexed perfToken,address indexed recipient,uint256 amount)';

const topic0_fees_withdraw = '0x78473f3f373f7673597f4f0fa5873cb4d375fea6d4339ad6b56dbd411513cb3f';
const topic0_token_earned = '0x7750c36249a9e8cdc4a6fb8a68035d55429ff67a4db8b110026b1375dd9d380c';

const contract_interface = new ethers.utils.Interface([
  event_fees_withdraw,
  event_token_earned
]);


const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
  try {
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const log_withdraw_fees: ILog[] = (await sdk.api.util.getLogs({
        target: Vault_Fee_Manager_Contracts[chain],
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic0_fees_withdraw]
      })).output as ILog[]
      console.log(log_withdraw_fees)
      return {
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
    // [CHAIN.ARBITRUM]: {
    //   fetch: fetch(CHAIN.ARBITRUM),
    //   start: async () => 1682121600,
    // },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1682121600,
    },
  }
};

export default adapter;
