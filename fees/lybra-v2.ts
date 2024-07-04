import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";


const address = '0xa980d4c0C2E48d305b582AA439a3575e3de06f0E'
const topic0_fees_distibute = '0xec0804e8e1decb589af9c4ba8ebfbacd3be98929d4d53457dfd186061f489f04';
const event_fees_distibute = 'event FeeDistribution(address indexed feeAddress,uint256 feeAmount,uint256 timestamp)';
const contract_interface = new ethers.Interface([
  event_fees_distibute
]);

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ETHEREUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ETHEREUM, {}));
  const dailyFees = (await sdk.getEventLogs({
    target: address,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0_fees_distibute],
    chain: CHAIN.ETHEREUM
  })).map((e: any) => contract_interface.parseLog(e))
    .map((e: any) => {
      return Number(e!.args.feeAmount) / 10 ** 18;
    }).reduce((a: number, b: number) => a + b, 0)
  const dailyRevenue = dailyFees;
  const dailyHoldersRevenue = dailyFees;
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyHoldersRevenue: `${dailyHoldersRevenue}`,
    timestamp
  }

}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1693440000,
    },
  }
};

export default adapter;
