import { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient, gql } from 'graphql-request';
import { price_id_mapping } from './pythpriceIds';
import BigNumber from "bignumber.js";

const subgraphEndpoint = "https://gateway-arbitrum.network.thegraph.com/api/7ca317c1d6347234f75513585a71157c/deployments/id/QmQF8cZUUb3hEVfuNBdGAQPBmvRioLsqyxHZbRRgk1zpVV"
const client = new GraphQLClient(subgraphEndpoint);

async function getUnderlyingAssetPrice(underlyingAsset: string) {
  const hermesApiEndpoint = "https://hermes.pyth.network"
  const mapping = price_id_mapping.find(m => m.token.toLowerCase() == underlyingAsset.toLowerCase());
  if (!mapping) {
    console.error(`No price ID found for underlying asset: ${underlyingAsset}`)
    return 0;
  }
  else if (mapping.price == 0) {
    try {
      const response = await fetch(`${hermesApiEndpoint}/v2/updates/price/latest?ids[]=${mapping.price_id}`);
      const data = await response.json();
      return data.parsed[0].price.price;
    }
    catch (error) {
      console.error(error)
      return 0;
    }
  }
  else {
    return mapping.price;
  }
}

async function calculateNotionalVolume(orders: any[]) {
  let notionalVolume = new BigNumber(0)
  for (const order of orders) {
    let price = 0;
    let price_bignumber = new BigNumber(0);
    let orderDetails = order.callOrder || order.putOrder;

    if (!orderDetails) {
      console.error("No order details found");
      continue;
    }
    let tokenInfo_underlying = price_id_mapping.find(m => m.token.toLowerCase() == orderDetails.underlyingAsset.toLowerCase());
    if (tokenInfo_underlying) {
      price = await getUnderlyingAssetPrice(orderDetails.underlyingAsset);
      if (order.callOrder) {
        let tokenInfo_strike = price_id_mapping.find(m => m.token.toLowerCase() == orderDetails.strikeAsset.toLowerCase());
        if (tokenInfo_strike) {
          notionalVolume = notionalVolume.plus(new BigNumber(orderDetails.strikeAmount).dividedBy(10 ** tokenInfo_strike.decimals))
          order.notionalVolume = new BigNumber(orderDetails.strikeAmount).dividedBy(10 ** tokenInfo_strike.decimals).toFixed(2)
        }
      }
      else if (order.putOrder) {
        price_bignumber = new BigNumber(price).dividedBy(10 ** tokenInfo_underlying.decimals_pyth)
        let underlyingAmount_bignumber = new BigNumber(orderDetails.underlyingAmount).dividedBy(10 ** tokenInfo_underlying.decimals)
        notionalVolume = notionalVolume.plus(price_bignumber.multipliedBy(underlyingAmount_bignumber))
        order.notionalVolume = price_bignumber.multipliedBy(underlyingAmount_bignumber).toFixed(2)
      }
    }
  }
  return notionalVolume.toFixed(2);
}

function calculatePremiumVolume(optionPremiums: any[]) {
  let premiumVolume = new BigNumber(0)
  for (const premium of optionPremiums) {
    let tokenInfo = price_id_mapping.find(m => m.token.toLowerCase() == premium.premiumAsset.toLowerCase());
    if (tokenInfo) {
      let primium_bigNumber = new BigNumber(premium.amount).dividedBy(10 ** tokenInfo.decimals)
      premiumVolume = premiumVolume.plus(primium_bigNumber);
    }
  }
  return premiumVolume.toFixed(2);
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

export async function fetchSubgraphData() {
  for (const mapping of price_id_mapping) {
    mapping.price = await getUnderlyingAssetPrice(mapping.token);
  }
  const now = Math.floor(Date.now() / 1000);
  const startOfDay = now - (now % 86400);
  const [dailyCallData, totalCallData, dailyPutData, totalPutData, dailyPremiumData, totalPremiumData] = await Promise.all([
    fetchCallOrder(client, startOfDay, now),
    fetchCallOrder(client, start, now),
    fetchPutOrder(client, startOfDay, now),
    fetchPutOrder(client, start, now),
    fetchOptionPremiums(client, startOfDay, now),
    fetchOptionPremiums(client, start, now)
  ]);
  const dailyNotionalVolume = await calculateNotionalVolume([...dailyCallData.callOrderEntities, ...dailyPutData.putOrderEntities]);
  const dailyPremiumVolume = calculatePremiumVolume(dailyPremiumData.optionPremiums);

  const totalNotionalVolume = await calculateNotionalVolume([...totalCallData.callOrderEntities, ...totalPutData.putOrderEntities]);
  const totalPremiumVolume = calculatePremiumVolume(totalPremiumData.optionPremiums);

  const transformedData = {
    dailyNotionalVolume: dailyNotionalVolume,
    dailyPremiumVolume: dailyPremiumVolume,
    totalNotionalVolume: totalNotionalVolume,
    totalPremiumVolume: totalPremiumVolume,
  };

  return transformedData;
}

const start = 1715175000

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchSubgraphData,
      runAtCurrTime: true,
      start: start,
    },
  }
}
export default adapter;
