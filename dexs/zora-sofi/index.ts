import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import * as sdk from '@defillama/sdk';

// const fetch: any = async (_a, _b, options: FetchOptions) => {
//     // we only count the contract volumes not the pool volumes(as pool volumes will be already counted in the uniswap pools)
//     const volumeRes = await queryDuneSql(options, `
//     WITH combined_volume AS (
//         -- Buy volume
//         SELECT
//             (cb.amountSold / pow(10, p.decimals)) * p.price as volume_usd,
//             cb.buyer as trader
//         FROM zora_base.coin_evt_coinbuy cb
//         LEFT JOIN prices.usd p
//             ON p.contract_address = cb.currency
//             AND p.blockchain = 'base'
//             AND p.minute = date_trunc('minute', cb.evt_block_time)
//         WHERE cb.evt_block_time >= from_unixtime(${options.startTimestamp})
//           AND cb.evt_block_time < from_unixtime(${options.endTimestamp})

//         UNION ALL

//         -- Sell volume
//         SELECT
//             (cs.amountPurchased / pow(10, p.decimals)) * p.price as volume_usd,
//             cs.seller as trader
//         FROM zora_base.coin_evt_coinsell cs
//         LEFT JOIN prices.usd p
//             ON p.contract_address = cs.currency
//             AND p.blockchain = 'base'
//             AND p.minute = date_trunc('minute', cs.evt_block_time)
//         WHERE cs.evt_block_time >= from_unixtime(${options.startTimestamp})
//           AND cs.evt_block_time < from_unixtime(${options.endTimestamp})
//     )
//     SELECT
//         sum(cv.volume_usd) as coin_contract_volume
//     FROM combined_volume cv
//     `);
//     const dailyVolume = volumeRes[0].coin_contract_volume
//     return { dailyVolume }
// }

interface IZoraFactory {
  factory: string;
  coinHook: string;
  creatorCoinHook: string;
  protocolRewards: string;
  fromBlock: number;
}

const ZoraFactories: {[key: string]: IZoraFactory} = {
  [CHAIN.BASE]: {
    factory: '0x777777751622c0d3258f214f9df38e35bf45baf3',
    coinHook: '0x9ea932730A7787000042e34390B8E435dD839040',
    creatorCoinHook: '0xd61a675f8a0c67a73dc3b54fb7318b4d91409040',
    protocolRewards: '0x7777777f279eba3d3ad8f4e708545291a6fdba8b',
    fromBlock: 26602741,
  },
};

const Abis = {
  protocolRewards: 'address:protocolRewards',
}

const Events = {
  CoinBuy: 'event CoinBuy(address indexed buyer, address indexed recipient, address indexed tradeReferrer, uint256 coinsPurchased, address currency, uint256 amountFee, uint256 amountCurrency)',
  CoinSell: 'event CoinSell(address indexed seller, address indexed recipient, address indexed tradeReferrer, uint256 coinsSold, address currency, uint256 amountFee, uint256 amountCurrency)',

  CoinMarketRewards: 'event CoinMarketRewards(address indexed payoutRecipient, address indexed platformReferrer, address protocolRewardRecipient, address currency, tuple(uint256 totalAmountCurrency, uint256 totalAmountCoin, uint256 creatorPayoutAmountCurrency, uint256 creatorPayoutAmountCoin, uint256 platformReferrerAmountCurrency, uint256 platformReferrerAmountCoin, uint256 protocolAmountCurrency, uint256 protocolAmountCoin) marketRewards)',
  CoinTradeRewards: 'event CoinTradeRewards(address indexed payoutRecipient, address indexed platformReferrer, address indexed tradeReferrer, address protocolRewardRecipient, uint256 creatorReward, uint256 platformReferrerReward, uint256 traderReferrerReward, uint256 protocolReward, address currency)',

  Swapped: 'event Swapped(address indexed sender, address indexed swapSender, bool isTrustedSwapSenderAddress, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bytes32 indexed poolKeyHash, tuple(bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params, int128 amount0, int128 amount1, bool isCoinBuy, bytes hookData, uint160 sqrtPriceX96)',
  CreatorCoinRewards: 'event CreatorCoinRewards(address indexed coin, address currency, address creator, address protocol, uint256 creatorAmount, uint256 protocolAmount)',
  CoinMarketRewardsV4: 'event CoinMarketRewardsV4(address coin, address currency, address payoutRecipient, address platformReferrer, address tradeReferrer, address protocolRewardRecipient, address dopplerRecipient, tuple(uint256 creatorPayoutAmountCurrency, uint256 creatorPayoutAmountCoin, uint256 platformReferrerAmountCurrency, uint256 platformReferrerAmountCoin, uint256 tradeReferrerAmountCurrency, uint256 tradeReferrerAmountCoin, uint256 protocolAmountCurrency, uint256 protocolAmountCoin, uint256 dopplerAmountCurrency, uint256 dopplerAmountCoin) marketRewards)',
}

const ZoraMetricCreatorReward = 'Creator Rewards'
const ZoraMetricTradeReferrer = 'Trade Referrer'
const ZoraMetricPlatformReferrer = 'Platform Referrer'
const ZoraMetricProtocolReward = 'Protocol Rewards'

// v3, we count CoinBuy and CoinSell events from all created coins and creator coins on Zora
// v4, we count Swapped events from coin hook and creator coin hook
async function getZoraCoinsVolume(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();

  const zoraFactory = ZoraFactories[options.chain];

  const fromBlock = Number(options.fromApi.block);
  const toBlock = Number(options.toApi.block);

  // v3
  const CoinBuyEvents = await sdk.getEventLogs({
    chain: options.chain,
    noTarget: true,
    eventAbi: Events.CoinBuy,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
  });
  const CoinSellEvents = await sdk.getEventLogs({
    chain: options.chain,
    noTarget: true,
    eventAbi: Events.CoinSell,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
  });

  const AllEvents = CoinBuyEvents.concat(CoinSellEvents);

  // we check coins with protocolRewards address is Zora protocol
  const coins: {[key: string]: string} = {};
  for (const event of AllEvents) {
    coins[String(event.address).toLowerCase()] = '';
  }
  const protocolRewards = await options.api.multiCall({
    abi: Abis.protocolRewards,
    calls: Object.keys(coins),
    permitFailure: true,
  })
  for (let i = 0; i < Object.keys(coins).length; i++) {
    if (protocolRewards[i]) {
      coins[Object.keys(coins)[i]] = String(protocolRewards[i]).toLowerCase();
    }
  }

  for (const event of AllEvents) {
    if (coins[String(event.address).toLowerCase()] === zoraFactory.protocolRewards) {
      const volume = Number(event.args.amountCurrency) + Number(event.args.amountFee);
      dailyVolume.add(event.args.currency, volume);
    }
  }

  // v4 creator coin hook swaps and coin hook swaps
  const CreatorCoinHookSwappedEvents = await sdk.getEventLogs({
    chain: options.chain,
    target: zoraFactory.creatorCoinHook,
    eventAbi: Events.Swapped,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
    onlyArgs: true,
  });
  const CoinHookSwappedEvents = await sdk.getEventLogs({
    chain: options.chain,
    target: zoraFactory.coinHook,
    eventAbi: Events.Swapped,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
    onlyArgs: true,
  });
  for (const event of CoinHookSwappedEvents.concat(CreatorCoinHookSwappedEvents)) {
    dailyVolume.add(event.poolKey.currency0, Math.abs(Number(event.amount0)));
  }

  return {
    dailyVolume: dailyVolume,
  }
}

// v3, we count CoinMarketRewards and CoinTradeRewards events from all created coins and creator coins on Zora
// v4, we count CreatorCoinRewards events from creator coin hook and CoinMarketRewardsV4 events from coin hook
async function getZoraCoinsfees(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const zoraFactory = ZoraFactories[options.chain];

  const fromBlock = Number(options.fromApi.block);
  const toBlock = Number(options.toApi.block);

  // v3 fees - events from coin and creator coin contracts
  const CoinMarketRewardsEvents = await sdk.getEventLogs({
    chain: options.chain,
    noTarget: true,
    eventAbi: Events.CoinMarketRewards,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
  });
  const CoinTradeRewardsEvents = await sdk.getEventLogs({
    chain: options.chain,
    noTarget: true,
    eventAbi: Events.CoinTradeRewards,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
  });

  // we check coins with protocolRewards address is Zora protocol
  const coins: {[key: string]: string} = {};
  for (const event of CoinMarketRewardsEvents.concat(CoinTradeRewardsEvents)) {
    coins[String(event.address).toLowerCase()] = '';
  }
  const protocolRewards = await options.api.multiCall({
    abi: Abis.protocolRewards,
    calls: Object.keys(coins),
    permitFailure: true,
  })
  for (let i = 0; i < Object.keys(coins).length; i++) {
    if (protocolRewards[i]) {
      coins[Object.keys(coins)[i]] = String(protocolRewards[i]).toLowerCase();
    }
  }

  for (const event of CoinMarketRewardsEvents) {
    if (coins[String(event.address).toLowerCase()] === zoraFactory.protocolRewards) {
      const currency = event.args.currency;
      const coin = event.address;
      dailyFees.add(currency, event.args.marketRewards.totalAmountCurrency, METRIC.SWAP_FEES);
      dailyFees.add(coin, event.args.marketRewards.totalAmountCoin, METRIC.SWAP_FEES);
      dailyRevenue.add(currency, event.args.marketRewards.protocolAmountCurrency, METRIC.SWAP_FEES);
      dailyRevenue.add(coin, event.args.marketRewards.protocolAmountCoin, METRIC.SWAP_FEES);
    }
  }
  for (const event of CoinTradeRewardsEvents) {
    if (coins[String(event.address).toLowerCase()] === zoraFactory.protocolRewards) {
      const currency = event.args.currency;

      const totalFees = Number(event.args.creatorReward) 
        + Number(event.args.platformReferrerReward) 
        + Number(event.args.traderReferrerReward) 
        + Number(event.args.protocolReward);

      dailyFees.add(currency, event.args.creatorReward, ZoraMetricCreatorReward);
      dailySupplySideRevenue.add(currency, event.args.creatorReward, ZoraMetricCreatorReward);

      dailyFees.add(currency, event.args.platformReferrerReward, ZoraMetricPlatformReferrer);
      dailySupplySideRevenue.add(currency, event.args.platformReferrerReward, ZoraMetricPlatformReferrer);

      dailyFees.add(currency, event.args.traderReferrerReward, ZoraMetricTradeReferrer);
      dailySupplySideRevenue.add(currency, event.args.traderReferrerReward, ZoraMetricTradeReferrer);

      dailyFees.add(currency, event.args.protocolReward, ZoraMetricProtocolReward);
      dailyRevenue.add(currency, event.args.protocolReward, ZoraMetricProtocolReward);
    }
  }

  // v4 fees - events from hook contract
  const CreatorCoinHookRewardsEvents = await sdk.getEventLogs({
    chain: options.chain,
    target: zoraFactory.creatorCoinHook,
    eventAbi: Events.CreatorCoinRewards,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
    onlyArgs: true,
  });
  for (const event of CreatorCoinHookRewardsEvents) {
    dailyFees.add(event.currency, event.creatorAmount, ZoraMetricCreatorReward)
    dailySupplySideRevenue.add(event.currency, event.creatorAmount, ZoraMetricCreatorReward)

    dailyFees.add(event.currency, event.protocolAmount, ZoraMetricProtocolReward)
    dailyRevenue.add(event.currency, event.protocolAmount, ZoraMetricProtocolReward)
  }

  // v4 market fees - events from v4 coin hook contract
  const CoinMarketRewardsV4Events = await sdk.getEventLogs({
    chain: options.chain,
    target: zoraFactory.coinHook,
    eventAbi: Events.CoinMarketRewardsV4,
    fromBlock,
    toBlock,
    maxBlockRange: 10000,
    onlyArgs: true,
  });
  for (const event of CoinMarketRewardsV4Events) {
    const currency = event.currency;
    const coin = event.coin;

      // currency
    dailyFees.add(currency, event.marketRewards.creatorPayoutAmountCurrency, ZoraMetricCreatorReward)
    dailySupplySideRevenue.add(currency, event.marketRewards.creatorPayoutAmountCurrency, ZoraMetricCreatorReward)

    dailyFees.add(currency, event.marketRewards.platformReferrerAmountCurrency, ZoraMetricPlatformReferrer)
    dailySupplySideRevenue.add(currency, event.marketRewards.platformReferrerAmountCurrency, ZoraMetricPlatformReferrer)

    dailyFees.add(currency, event.marketRewards.tradeReferrerAmountCurrency, ZoraMetricTradeReferrer)
    dailySupplySideRevenue.add(currency, event.marketRewards.tradeReferrerAmountCurrency, ZoraMetricTradeReferrer)

    dailyFees.add(currency, Number(event.marketRewards.protocolAmountCurrency) + Number(event.marketRewards.dopplerAmountCurrency), ZoraMetricProtocolReward)
    dailyRevenue.add(currency, Number(event.marketRewards.protocolAmountCurrency) + Number(event.marketRewards.dopplerAmountCurrency), ZoraMetricProtocolReward)

    // coin
    dailyFees.add(coin, event.marketRewards.creatorPayoutAmountCoin, ZoraMetricCreatorReward)
    dailySupplySideRevenue.add(coin, event.marketRewards.creatorPayoutAmountCoin, ZoraMetricCreatorReward)

    dailyFees.add(coin, event.marketRewards.platformReferrerAmountCoin, ZoraMetricPlatformReferrer)
    dailySupplySideRevenue.add(coin, event.marketRewards.platformReferrerAmountCoin, ZoraMetricPlatformReferrer)

    dailyFees.add(coin, event.marketRewards.tradeReferrerAmountCoin, ZoraMetricTradeReferrer)
    dailySupplySideRevenue.add(coin, event.marketRewards.tradeReferrerAmountCoin, ZoraMetricTradeReferrer)

    dailyFees.add(coin, Number(event.marketRewards.protocolAmountCoin) + Number(event.marketRewards.dopplerAmountCoin), ZoraMetricProtocolReward)
    dailyRevenue.add(coin, Number(event.marketRewards.protocolAmountCoin) + Number(event.marketRewards.dopplerAmountCoin), ZoraMetricProtocolReward)
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

export async function getZoraCoinsData(options: FetchOptions, data: 'fees' | 'volume'): Promise<FetchResultV2> {
  if (data === 'volume') {
    return await getZoraCoinsVolume(options);
  } else {
    return await getZoraCoinsfees(options);
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: async function fetch(options: FetchOptions): Promise<FetchResultV2> {
        return await getZoraCoinsData(options, 'volume');
      },
      start: '2025-02-19',
    },
  },
};

export default adapter;
