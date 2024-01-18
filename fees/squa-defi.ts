import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";

const usdcDecimals = 6
const keyManagerQureFiAddr = '0xfad362E479AA318F2De7b2c8a1993Df9BB2B3b1f';
const topic0_trade = '0xfc742fe2e3355b8dcced6d8103bd681a9c1e0e72a5f292d77eb3dbe7874c3557';
const event_trade = 'event Trade(address indexed trader,address indexed influencer,uint8 indexed direction,uint256 keysAmount,uint256 price,uint256 platformFee,uint256 influencerFee,uint256 keysSupply)';
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
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.BASE, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.BASE, {}));
  try {
    let _logs: ILog[] = [];
    for(let i = fromBlock; i < toBlock; i += 5000) {
      const logs: ILog[] = (await sdk.getEventLogs({
        target: keyManagerQureFiAddr,
        toBlock: i + 5000,
        fromBlock: i,
        chain: CHAIN.BASE,
        topics: [topic0_trade]
      })) as ILog[];
      _logs = _logs.concat(logs);
    }

    const fees_details: IFee[] = _logs.map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      
      const platformFee = Number(value!.args.platformFee) / 10 ** usdcDecimals;
      const influencerFee = Number(value!.args.influencerFee) / 10 ** usdcDecimals;

      return {
        fees: platformFee + influencerFee,
        rev: platformFee
      } as IFee
    })
    
    const dailyFeesUSDC = fees_details.reduce((a: number, b: IFee) => a+b.fees, 0)
    const dailyRevUSDC = fees_details.reduce((a: number, b: IFee) => a+b.rev, 0)
    return {
      dailyFees: `${dailyFeesUSDC}`,
      dailyRevenue: `${dailyRevUSDC}`,
      timestamp
    }
  } catch (error) {
    console.error(error)
    throw error;
  }

}


const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
        fetch: fetch,
        start: async ()  => 1703255087,
    },
  }
}

export default adapter;
