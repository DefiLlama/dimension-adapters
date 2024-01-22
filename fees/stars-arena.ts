import { Adapter, DISABLED_ADAPTER_KEY, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import disabledAdapter from "../helpers/disabledAdapter";

const address = '0x563395a2a04a7ae0421d34d62ae67623caf67d03';
const topic0_trade = '0xc9d4f93ded9b42fa24561e02b2a40f720f71601eb1b3f7b3fd4eff20877639ee';
const event_trade = 'event Trade(address trader,address subject,bool isBuy,uint256 shareAmount,uint256 amount,uint256 protocolAmount,uint256 subjectAmount,uint256 referralAmount,uint256 supply,uint256 buyPrice,uint256 myShares)'
const contract_interface = new ethers.Interface([
  event_trade
]);

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IFee {
  fees: number;
  rev: number;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  try {
    return {
      dailyFees: `${0}`,
      dailyRevenue: `${0}`,
      timestamp
    }
  } catch (error) {
    console.error(error)
    throw error;
  }

}


const adapter: Adapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.AVAX]: {
        fetch: fetch,
        start: async ()  => 1695081600,
    },
  }
}

export default adapter;
