import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { nullAddress } from "../helpers/token";

const ZORA_FACTORY_ADDRESS = '0x777777751622c0d3258f214F9DF38E35BF45baF3';
const ZORA_PROTOCOL_REWARDS = '0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B';

const COIN_TRADE_REWARDS_TOPIC = "0x6b67f906562afcdc3afeeeb6754e906cc24d9ce090e9db1b7b68e6462682d966";
const COIN_MARKET_REWARDS_TOPIC = "0xd2e31f07440ca680ea380c07ac85551d333179b92ab1e83534bf08248304be21";
const COIN_CREATED_TOPIC = "0x3d1462491f7fa8396808c230d95c3fa60fd09ef59506d0b9bd1cf072d2a03f56";

const COIN_TRADE_REWARDS_ABI = 'event CoinTradeRewards(address indexed creatorPayoutRecipient, address indexed platformReferrer, address indexed orderReferrer, address protocolRewardRecipient, uint256 creatorReward, uint256 platformReferrerReward, uint256 orderReferrerReward, uint256 protocolReward, address currency)';
const COIN_MARKET_REWARDS_ABI = 'event CoinMarketRewards(address indexed payoutRecipient, address indexed platformReferrer, address protocolRewardRecipient, address currency, tuple(uint256 totalAmountCurrency, uint256 totalAmountCoin, uint256 creatorPayoutAmountCurrency, uint256 creatorPayoutAmountCoin, uint256 platformReferrerAmountCurrency, uint256 platformReferrerAmountCoin, uint256 protocolAmountCurrency, uint256 protocolAmountCoin) marketRewards)';
const COIN_CREATED_ABI = 'event CoinCreated(address indexed caller, address indexed payoutRecipient, address indexed platformReferrer, address currency, string uri, string name, string symbol, address coin, address pool, string version)';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // const coin_created_logs = await options.getLogs({
  //   noTarget: true,
  //   fromBlock: 26602741, // factory contract deployed at block 26602741
  //   topic: COIN_CREATED_TOPIC,
  //   eventAbi: COIN_CREATED_ABI
  // });

  // const trade_rewards_logs = await options.getLogs({
  //   noTarget: true,
  //   topic: COIN_TRADE_REWARDS_TOPIC,
  //   eventAbi: COIN_TRADE_REWARDS_ABI
  // });

  // const market_rewards_logs = await options.getLogs({
  //   noTarget: true,
  //   topic: COIN_MARKET_REWARDS_TOPIC,
  //   eventAbi: COIN_MARKET_REWARDS_ABI
  // });

  // for (const log of trade_rewards_logs) {
  //   const creatorReward = Number(log.creatorReward || 0);
  //   const platformReferrerReward = Number(log.platformReferrerReward || 0);
  //   const orderReferrerReward = Number(log.orderReferrerReward || 0); 
  //   const protocolReward = Number(log.protocolReward || 0);
    
  //   const totalFee = creatorReward + platformReferrerReward + orderReferrerReward + protocolReward;

  //   dailyFees.add(log.currency, totalFee);
  //   dailyRevenue.add(log.currency, protocolReward);
  // }

  // for (const log of market_rewards_logs) {
  //   if (log.marketRewards) {
  //     const totalAmountCurrency = Number(log.marketRewards.totalAmountCurrency || 0);
  //     const protocolAmountCurrency = Number(log.marketRewards.protocolAmountCurrency || 0);
      
  //     dailyFees.add(log.currency, totalAmountCurrency);
  //     dailyRevenue.add(log.currency, protocolAmountCurrency);
  //   }
  // }

  const feesRes = await queryDuneSql(options, `
    WITH combined_fees AS (
      SELECT 
        (coalesce(creatorReward, 0) + coalesce(platformReferrerReward, 0) + coalesce(traderReferrerReward, 0) + coalesce(protocolReward, 0)) as total_fee,
        protocolReward
      FROM zora_base.coin_evt_cointraderewards
      WHERE
        evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})

      UNION ALL
      
      SELECT 
        CAST(json_value(marketRewards, 'lax $.totalAmountCurrency') AS DECIMAL) AS total_fee,
        CAST(json_value(marketRewards, 'lax $.protocolAmountCurrency') AS DECIMAL) AS protocolReward
      FROM zora_base.coin_evt_coinmarketrewards
      WHERE 
        evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT 
        sum(total_fee) as total_fees,
        sum(protocolReward) as protocolReward_fees
    FROM combined_fees
  `);

  dailyFees.add(nullAddress, feesRes[0].total_fees);
  dailyRevenue.add(nullAddress, feesRes[0].protocolReward_fees);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyUserFees: dailyFees
  }
}

const methodology = {
  Fees: "All fees from trading coins, including: 1% Trade Rewards fee on direct Zora trades (0.5% to Creator, 0.15% to Trade Referrer, 0.15% to Create Referrer, 0.2% to Zora) and 1% Market Rewards fee on initial Uniswap market trades (0.5% to Creator, 0.25% to Create Referrer, 0.25% to Zora)",
  Revenue: "Portion of fees that go to the Zora protocol (0.2% from Trade Rewards and 0.25% from Market Rewards)",
  UserFees: "All fees paid by users when trading coins",
  ProtocolRevenue: "Portion of fees that go to the Zora protocol"
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-02-19',
      meta: {
        methodology
      }
    },
  },
  isExpensiveAdapter: true
}

export default adapter;
