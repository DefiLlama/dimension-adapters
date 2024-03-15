import { request, gql } from "graphql-request";

export const MIN_TIMESTAMP = 1640217600;
const SPORT_MIN_TIMESTAMP = 1659312000;
const SPORT_ENDPOINT = "https://api.thegraph.com/subgraphs/name/thales-markets/sport-markets-optimism";

type Volume = {
  timestamp: number
  amount: string
} 

type SportVolume = Volume & { paid: string } 

interface GqlResult {
  accountBuyVolumes: Array<Volume>
}

interface SportResult {
  marketTransactions: Array<SportVolume>
}

interface ChainData {
  timestamp: number
  totalPremiumVolume: number
  totalNotionalVolume: number
  dailyPremiumVolume: number
  dailyNotionalVolume: number
}

const chainDataQuery = gql`
  query ($start: Int, $end: Int) {
    accountBuyVolumes(
      first: 1000,
      orderBy: timestamp,
      orderDirection: desc,
      where: { timestamp_gte: $start, timestamp_lt: $end }
    ) {
      amount
      timestamp
    }
  }
`
const sportDataQuery = gql`
  query ($start: Int, $end: Int) {
    marketTransactions(
      first: 1000,
      orderBy: timestamp,
      orderDirection: desc,
      where: { timestamp_gte: $start, timestamp_lt: $end }
    ) {
      amount
      paid
      timestamp
    }
  }
`

async function getChainData(
  url: string,
  timestamp: number,
  chain: string,
): Promise<ChainData> {
  let volumes: Volume[] = []; 
  let sportVolumes: SportVolume[] = []; 
  let queryResponseCount = 0;
  let lastTimestamp = timestamp;
  let decimal = ['optimism', 'bsc'].includes(chain) ? 1e18 : 1e6;
  let dailySportNotionalVolume = 0;
  let totalSportNotionalVolume = 0;
  
  do {
    const { accountBuyVolumes }: GqlResult = await request(url, chainDataQuery, {
      start: MIN_TIMESTAMP, end: Number(lastTimestamp)
    });
  
    queryResponseCount = accountBuyVolumes.length;
    lastTimestamp = accountBuyVolumes[accountBuyVolumes.length - 1].timestamp;
    volumes.push(...accountBuyVolumes);
  } while (queryResponseCount == 1000);

  const { accountBuyVolumes: daily }: GqlResult = await request(url, chainDataQuery, {
    start: Number(timestamp) - 86400, end: Number(timestamp)
  });

  let dailyPremiumVolume = daily.reduce((acc, curr) => Number(curr.amount) / decimal + acc, 0);
  let totalPremiumVolume = volumes.reduce((acc, curr) => Number(curr.amount) / decimal + acc, 0);

  if (chain === 'optimism') {
    queryResponseCount = 0;
    lastTimestamp = timestamp;
    do {
      const { marketTransactions }: SportResult = await request(SPORT_ENDPOINT, sportDataQuery, {
        start: SPORT_MIN_TIMESTAMP, end: Number(lastTimestamp)
      });
    
      queryResponseCount = marketTransactions.length;
      lastTimestamp = marketTransactions[queryResponseCount - 1].timestamp;
      sportVolumes.push(...marketTransactions);
    } while (queryResponseCount == 1000);

    const { marketTransactions: dailySport }: SportResult = await request(SPORT_ENDPOINT, sportDataQuery, {
      start: Number(timestamp) - 86400, end: Number(timestamp)
    });

    dailyPremiumVolume += dailySport.reduce((acc, curr) => Number(curr.paid) / decimal + acc, 0);
    totalPremiumVolume += sportVolumes.reduce((acc, curr) => Number(curr.paid) / decimal + acc, 0);
    dailySportNotionalVolume = dailySport.reduce((acc, curr) => Number(curr.amount) / decimal + acc, 0);
    totalSportNotionalVolume = sportVolumes.reduce((acc, curr) => Number(curr.amount) / decimal + acc, 0);
  }
  return {
    timestamp,
    totalPremiumVolume,
    totalNotionalVolume: totalPremiumVolume + totalSportNotionalVolume,
    dailyPremiumVolume,
    dailyNotionalVolume: dailyPremiumVolume + dailySportNotionalVolume,
  }
}

export default getChainData;


