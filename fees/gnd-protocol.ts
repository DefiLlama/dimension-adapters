import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";


const topic0_fund_supply = '0xb1fa5064e2075b991c022c25e7b05c0a1b56a9462985b12fe2e89e51b46c6b8b'
const event_funds_supply = 'event SupplyFund(uint256 amount)';
const contract_interface = new ethers.Interface([
  event_funds_supply,
]);
interface IData {
  amount: number;
}
type TAddress = {
  [s: string]: string;
}
const address_buyback: TAddress = {
  [CHAIN.ARBITRUM]: '0x5f0feef4dafea7fb4d6ca89c047767885226b5f9'
}
type TTopics = {
  [s: string]: string[];
}
const weth_address_tranfer_topic:TTopics = {
  [CHAIN.ARBITRUM]: [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    '0x000000000000000000000000d70811f1e4992aa051d54e29a04c8925b32fba7d',
    '0x000000000000000000000000535ec56479892d9c02fe2bb86cebf7ed62e81131'
  ]
}

const weth_address: TAddress  = {
  [CHAIN.ARBITRUM]: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp

    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    const logs_fund_disposit: IData[] = (await sdk.getEventLogs({
      target: address_buyback[chain],
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_fund_supply]
    })).map((a: any) => contract_interface.parseLog(a))
      .map((a: any) => {
        return {
          amount: Number(a!.args.amount) / 10 ** 18,
        } as IData
      });

      const logs_dividends: any[] = (await sdk.getEventLogs({
        target: weth_address[chain],
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: weth_address_tranfer_topic[chain]
      }))
        .map((a: any) => {
          return {
            amount: Number(a.data) / 10 ** 18,
          } as IData
        });

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const buybackAmount = logs_fund_disposit.reduce((sum: number, a: IData) => sum + a.amount, 0);
    const dividends = logs_dividends.reduce((a: number, b: IData) => a + b.amount, 0);
    const buybackAmountUSD = buybackAmount * ethPrice;
    const dividendsUSD = dividends * ethPrice;
    const dailyFees = buybackAmountUSD + dividendsUSD;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${buybackAmountUSD}`,
      dailyHoldersRevenue: `${buybackAmountUSD}`,
      dailySupplySideRevenue: `${dividendsUSD}`,
      timestamp
    }
  }
}

const methodology = {
  Fees: "total protocol revenue collected from univ3 engine and gmusd.",
  Revenue: "Revenue allocated for buyback.",
  SupplySideRevenue: "Revenue allocated for dividends.",
  HoldersRevenue: "Revenue allocated for buyback."
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1681430400,
      meta: {
        methodology
      }
  },
  }
}

export default adapter;
