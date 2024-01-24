import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

const market_address = '0xcda72070e455bb31c7690a170224ce43623d0b6f';
const nft_drop_market_address = '0x53f451165ba6fdbe39a134673d13948261b2334a';

const topic_0_reserveAuction_finalized = '0x2edb0e99c6ac35be6731dab554c1d1fa1b7beb675090dbb09fb14e615aca1c4a';

const topic_0_private_sale_finalized = '0x6c623fa5e13aaaf28288f807e5b4f9ec6fb7ef812568e00317c552663bea918f';

const topic_0_buyPrice_accepted = '0xd28c0a7dd63bc853a4e36306655da9f8c0b29ff9d0605bb976ae420e46a99930';

const topic_0_offer_accepted = '0x1cb8adb37d6d35e94cd0695ca39895b84371864713f5ca7eada52af9ff23744b'

const topic_0_mint_from_fixed_price_drop = '0x05ebbb6b0ce7d564230ba625dd7a0e5108786b0852d6060de6099e1778203e34'

const topic_0_withdraw_creator_revenue_from_dutch_auction = '0x5e16e96b4ba4fe46f3be73d54d1fa0da481494ab74c2d6e33328366d6437693c'

interface IFee {
  totalFees: number;
}
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.ETHEREUM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.ETHEREUM, {}));
    const logs_reserveAuction_finalized: IFee[] = (await sdk.getEventLogs({
      target: market_address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ETHEREUM,
      topics: [topic_0_reserveAuction_finalized]
    })).map((e: any) => {
      const amount = Number('0x' + e.data.replace('0x', '').slice(0, 64)) / 10 **  18;
      return {
        totalFees: amount
      }
    });

    const logs_private_sale_finalized: IFee[] = (await sdk.getEventLogs({
      target: market_address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ETHEREUM,
      topics: [topic_0_private_sale_finalized]
    })).map((e: any) => {
      const amount = Number('0x' + e.data.replace('0x', '').slice(64, 128)) / 10 **  18;
      return {
        totalFees: amount
      }
    });

    const logs_buyPrice_accepted: IFee[] = (await sdk.getEventLogs({
      target: market_address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ETHEREUM,
      topics: [topic_0_buyPrice_accepted]
    })).map((e: any) => {
      const amount = Number('0x' + e.data.replace('0x', '').slice(64, 128)) / 10 **  18;
      return {
        totalFees: amount
      }
    });

    const logs_offer_accepted: IFee[] = (await sdk.getEventLogs({
      target: market_address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ETHEREUM,
      topics: [topic_0_offer_accepted]
    })).map((e: any) => {
      const amount = Number('0x' + e.data.replace('0x', '').slice(64, 128)) / 10 **  18;
      return {
        totalFees: amount
      }
    });

    const logs_mint_from_fixed_price_drop: IFee[] = (await sdk.getEventLogs({
      target: nft_drop_market_address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ETHEREUM,
      topics: [topic_0_mint_from_fixed_price_drop]
    })).map((e: any) => {
      const amount = Number('0x' + e.data.replace('0x', '').slice(64, 128)) / 10 **  18;
      return {
        totalFees: amount
      }
    });

    const logs_withdraw_creator_revenue_from_dutch_auction: IFee[] = (await sdk.getEventLogs({
      target: nft_drop_market_address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ETHEREUM,
      topics: [topic_0_withdraw_creator_revenue_from_dutch_auction]
    })).map((e: any) => {
      const amount = Number('0x' + e.data.replace('0x', '').slice(128, 192)) / 10 **  18;
      return {
        totalFees: amount
      }
    });

    const total_logs = [
      ...logs_reserveAuction_finalized,
      ...logs_private_sale_finalized,
      ...logs_buyPrice_accepted,
      ...logs_offer_accepted,
      ...logs_mint_from_fixed_price_drop,
      ...logs_withdraw_creator_revenue_from_dutch_auction,
    ]
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const totalFees = total_logs.reduce((a: number, b: IFee) => a + b.totalFees, 0)
    const dailyFees = totalFees * ethPrice
    const dailyRevenue = dailyFees;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch,
        start: async ()  => 1612137600,
    },
  }
}

export default adapter;
