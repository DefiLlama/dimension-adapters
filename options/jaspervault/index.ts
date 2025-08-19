import { Adapter, FetchOptions, ChainEndpoints } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient, gql } from 'graphql-request';
import { Balances, } from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import BigNumber from "bignumber.js";
import ADDRESSES from '../../helpers/coreAssets.json'

const iBTC_arbitrum = '0x050C24dBf1eEc17babE5fc585F06116A259CC77A'
const WSOL_arbitrum = '0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07'
const UNI_arbitrum = '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0'
const cbBTC_base = ADDRESSES.ethereum.cbBTC
const USDT_btr = '0xfe9f969faf8ad72a83b761138bf25de87eff9dd2'
type TokenContracts = {
  [key in Chain]: string[][];
};

const contracts: TokenContracts = {
  [CHAIN.ARBITRUM]: [
    [ADDRESSES.arbitrum.WETH],
    [ADDRESSES.arbitrum.WBTC],
    [ADDRESSES.arbitrum.USDC],
    [ADDRESSES.arbitrum.USDT],
    [ADDRESSES.arbitrum.ARB],
    [ADDRESSES.arbitrum.LINK],
    [UNI_arbitrum],
    [WSOL_arbitrum],
    [iBTC_arbitrum]
  ],
  [CHAIN.BASE]: [
    [ADDRESSES.base.USDC],
    [cbBTC_base],
  ],
  [CHAIN.BITLAYER]: [
    [USDT_btr]
  ],
}
const chainsStartTimes: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1715175000,
  [CHAIN.BASE]: 1723001211,
  [CHAIN.BITLAYER]: 1723001211,
}
let tokenDecimals: any = {}
const subgraphEndpoints: ChainEndpoints = {}
subgraphEndpoints[CHAIN.ARBITRUM] = "https://arb.subgraph.jaspervault.io";
subgraphEndpoints[CHAIN.BASE] = "https://base.subgraph.jaspervault.io";
subgraphEndpoints[CHAIN.BITLAYER] = "https://subgraphs.jaspervault.io/subgraphs/jaspervault-bitlayer";

function getDecimals(token_address: string) {
  token_address = token_address.toLowerCase()
  if (token_address == ADDRESSES.GAS_TOKEN_2)
    return 18

  if (tokenDecimals[token_address])
    return tokenDecimals[token_address]
  return 0;
}

// event logs can be found here: https://github.com/DefiLlama/dimension-adapters/pull/1492#issuecomment-2118112517
function calculateNotionalVolume(balances: Balances, orders: any[], chain: Chain) {
  for (const order of orders) {
    let orderDetails = order.callOrder || order.putOrder;
    if (!orderDetails) {
      console.error("No order details found");
      continue;
    }
    //v1 orders
    if (!orderDetails.quantity) {
      if (order.callOrder) {
        let decimals_strikeAsset: number = getDecimals(orderDetails.strikeAsset);
        if (decimals_strikeAsset == 0) {
          console.error("No decimals data found for strikeAsset", orderDetails.strikeAsset, chain);
          continue;
        }
        let decimals_underlyingAsset = getDecimals(orderDetails.underlyingAsset);
        if (decimals_underlyingAsset == 0) {
          console.error("No decimals data found for underlyingAsset", orderDetails.underlyingAsset);
          continue;
        }
        let notionalValue = new BigNumber(orderDetails.strikeAmount).dividedBy(new BigNumber(10).pow(decimals_strikeAsset)).multipliedBy(new BigNumber(orderDetails.underlyingAmount).dividedBy(new BigNumber(10).pow(decimals_underlyingAsset)))
        notionalValue = notionalValue.decimalPlaces(Number(decimals_strikeAsset)).multipliedBy(new BigNumber(10).pow(decimals_strikeAsset));
        balances.add(orderDetails.strikeAsset, notionalValue);
      }
      else if (order.putOrder) {
        balances.add(orderDetails.underlyingAsset, orderDetails.underlyingAmount)
      }
    }
    //v2 orders
    else {
      if (order.callOrder) {
        let decimals_strikeAsset: number = getDecimals(orderDetails.strikeAsset);
        if (decimals_strikeAsset == 0) {
          console.error("No decimals data found for strikeAsset", orderDetails.strikeAsset, chain);
          continue;
        }
        let notionalValue = new BigNumber(orderDetails.strikeAmount).dividedBy(new BigNumber(10).pow(decimals_strikeAsset)).multipliedBy(new BigNumber(orderDetails.quantity).dividedBy(new BigNumber(10).pow(18)))
        notionalValue = notionalValue.decimalPlaces(Number(decimals_strikeAsset)).multipliedBy(new BigNumber(10).pow(decimals_strikeAsset));
        balances.add(orderDetails.strikeAsset, notionalValue);
      }
      else if (order.putOrder) {
        let decimals_lockAsset: number = getDecimals(orderDetails.lockAsset);
        if (decimals_lockAsset == 0) {
          console.error("No decimals data found for lockAsset", orderDetails.lockAsset, chain);
          continue;
        }
        let notionalValue = new BigNumber(orderDetails.lockAmount).dividedBy(new BigNumber(10).pow(decimals_lockAsset)).multipliedBy(new BigNumber(orderDetails.quantity).dividedBy(new BigNumber(10).pow(18)))
        notionalValue = notionalValue.decimalPlaces(Number(decimals_lockAsset)).multipliedBy(new BigNumber(10).pow(decimals_lockAsset));
        balances.add(orderDetails.lockAsset, notionalValue);
      }

    }
  }
}

function calculatePremiumVolume(balances: Balances, optionPremiums: any[]) {
  for (const premium of optionPremiums) {
    //The premium data for these orders during this period is incorrect, so we should ignore the premium data for this batch of orders.
    if (premium.orderID <= 4309 || premium.orderID >= 4343) {
      balances.add(premium.premiumAsset, premium.amount)
    }
  }
}

async function fetchCallOrder(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { callOrderEntities: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        callOrderEntities(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          callOrder {
            underlyingAsset
            underlyingAmount
            strikeAsset
            strikeAmount
          }
          orderId
          transactionHash
        }
      }
    `;
    const result = await client.request(query);
    allData.callOrderEntities.push(...result.callOrderEntities as never[]);
    skip += pageSize;
    hasMore = result.callOrderEntities.length === pageSize;
  }
  return allData;
}
async function fetchCallOrderV2(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { callOrderEntities: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        callOrderEntityV2S(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          callOrder {
            underlyingAsset
            quantity
            strikeAsset
            strikeAmount
          }
          orderId
          transactionHash
        }
      }`
    const result = await client.request(query);
    allData.callOrderEntities.push(...result.callOrderEntityV2S as never[]);
    skip += pageSize;
    hasMore = result.callOrderEntityV2S.length === pageSize;
  }
  return allData;
}
async function fetchPutOrder(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { putOrderEntities: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        putOrderEntities(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          putOrder {
            underlyingAsset
            underlyingAmount
            strikeAsset
            strikeAmount
          }
          orderId
          transactionHash
        }
      }`
    const result = await client.request(query);
    allData.putOrderEntities.push(...result.putOrderEntities as never[]);
    skip += pageSize;
    hasMore = result.putOrderEntities.length === pageSize;
  }
  return allData;
}
async function fetchPutOrderV2(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { putOrderEntities: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        putOrderEntityV2S(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          putOrder {
            underlyingAsset
            lockAsset
            lockAmount
            quantity
            strikeAsset
            strikeAmount
          }
          orderId
          transactionHash
        }
      }`
    const result = await client.request(query);
    allData.putOrderEntities.push(...result.putOrderEntityV2S as never[]);
    skip += pageSize;
    hasMore = result.putOrderEntityV2S.length === pageSize;
  }
  return allData;
}
async function fetchOptionPremiums(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { optionPremiums: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        optionPremiums(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          amount
          premiumAsset
          orderID
          transactionHash 
        }
      }
    `;
    const result = await client.request(query);
    allData.optionPremiums.push(...result.optionPremiums as never[]);
    skip += pageSize;
    hasMore = result.optionPremiums.length === pageSize;
  }
  return allData;
}

export async function fetchSubgraphData({ createBalances, startTimestamp, endTimestamp, chain, api }: FetchOptions) {
  const client = new GraphQLClient(subgraphEndpoints[chain]);
  const now = endTimestamp;
  const startOfDay = startTimestamp;
  const tokens = contracts[chain].map(i => i[0]);

  const [
    dailyCallData, dailyCallDataV2, dailyPutData, dailyPutDataV2, dailyPremiumData,
    // totalCallData, totalPutData, totalPremiumData
  ] = await Promise.all([
    fetchCallOrder(client, startOfDay, now),
    fetchCallOrderV2(client, startOfDay, now),
    fetchPutOrder(client, startOfDay, now),
    fetchPutOrderV2(client, startOfDay, now),
    fetchOptionPremiums(client, startOfDay, now),
    // fetchCallOrder(client, start, now),
    // fetchPutOrder(client, start, now),
    // fetchOptionPremiums(client, start, now)
  ]);
  const dailyNotionalVolume = createBalances()
  const dailyPremiumVolume = createBalances()

  const tokenSet= new Set<string>()
  const allOrders =  [...dailyCallData.callOrderEntities, ...dailyCallDataV2.callOrderEntities, ...dailyPutData.putOrderEntities, ...dailyPutDataV2.putOrderEntities]
  allOrders.forEach((order: any)=>{
    const fields = ['callOrder', 'putOrder']
    for (const field of fields) {
      const { strikeAsset, underlyingAsset, lockAsset } = order[field] ?? {}
      if (strikeAsset) tokenSet.add(strikeAsset.toLowerCase())
      if (underlyingAsset) tokenSet.add(underlyingAsset.toLowerCase())
      if (lockAsset) tokenSet.add(lockAsset.toLowerCase())
    }
    if (order.strikeAsset) tokenSet.add(order.strikeAsset)
  })

  let decimals = await api.multiCall({ abi: 'erc20:decimals', calls: tokens, });

  tokens.map((token, index) => {
    tokenDecimals[token.toLowerCase()] = decimals[index];
  });

  calculateNotionalVolume(dailyNotionalVolume,allOrders, chain);
  calculatePremiumVolume(dailyPremiumVolume, dailyPremiumData.optionPremiums);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: Object.keys(subgraphEndpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetchSubgraphData,
        start: chainsStartTimes[chain],
      }
    }
  }, {})
}
export default adapter;
