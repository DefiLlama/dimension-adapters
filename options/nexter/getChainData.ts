import ADDRESSES from '../../helpers/coreAssets.json'

import { request, gql } from "graphql-request";
import { getPrices } from "../../utils/prices";

export const MIN_TIMESTAMP = 1640217600;

type Volume = {
  betStartTimestamp: number
  totalAmount: string
} 

interface GqlResult {
  roundInfos: Array<Volume>
}


interface ChainData {
  timestamp: number
  totalPremiumVolume: number
  dailyPremiumVolume: number
}

const chainDataQuery = gql`
  query ($start: Int, $end: Int) {
    roundInfos(
      first: 1000,
      orderBy: betStartTimestamp,
      orderDirection: desc,
      where: { totalAmount_gt:0, betStartTimestamp_gte: $start, betStartTimestamp_lt: $end }
    ) {
      betStartTimestamp
      totalAmount
    }
  }
`

async function getChainData(
  url: string,
  timestamp: number,
  chain: string,
): Promise<ChainData> {
  let volumes: Volume[] = []; 
  let queryResponseCount = 0;
  let lastTimestamp = timestamp;
  let decimal = 1e18;
  const ethAddress = chain + ":" + ADDRESSES.null;
  const ethPrice = (await getPrices([ethAddress], Number(timestamp)))[ethAddress].price;
  do {
    const { roundInfos }: GqlResult = await request(url, chainDataQuery, {
      start: MIN_TIMESTAMP, end: Number(lastTimestamp)
    });
    queryResponseCount = roundInfos.length;
    lastTimestamp = roundInfos[roundInfos.length - 1].betStartTimestamp;
    volumes.push(...roundInfos);
  } while (queryResponseCount == 1000);

  const { roundInfos: daily }: GqlResult = await request(url, chainDataQuery, {
    start: Number(timestamp) - 86400, end: Number(timestamp)
  });

  let dailyPremiumVolume = daily.reduce((acc, curr) => (Number(curr.totalAmount) / decimal) * ethPrice + acc, 0);
  let totalPremiumVolume = volumes.reduce((acc, curr) => (Number(curr.totalAmount) / decimal) * ethPrice + acc, 0);
  

  return {
    timestamp,
    totalPremiumVolume,
    dailyPremiumVolume,
  }
}

export default getChainData;


