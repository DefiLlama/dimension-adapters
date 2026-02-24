import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { request, gql } from "graphql-request";

const BASE_MAINNET_SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cm3exke617zqh01074tulgtx0/subgraphs/collar-base-mainnet/0.1.3/gn'

// Helper to fetch all paginated results from a subgraph
async function fetchAllSubgraphResults({ url, query, field, variables = {} }) {
  let skip = 0;
  let allResults: any[] = [];
  let hasMore = true;
  while (hasMore) {
    const data = await request(url, query, { ...variables, skip });
    const results = data[field];
    allResults = [...allResults, ...results];
    if (results.length < 1000) {
      hasMore = false;
    } else {
      skip += 1000;
    }
  }
  return allResults;
}


async function revenue(startTime: number, endTime: number) {
  const query = gql`
    query getProtocolFees($startTime: Int!, $endTime: Int!) {
      providerPositions(first: 1000, where: { createdAt_gte: $startTime, createdAt_lt: $endTime}) {
        protocolFeeAmount
          collarProviderNFT {
            cashAsset
          }
      }
    }
  `;
  const data = await request(BASE_MAINNET_SUBGRAPH_URL, query, {
    startTime,
    endTime
  });
  return data.providerPositions;
}

async function allEscrowLoans(endTime: number) {
  // all escrow loans that have accrued interest in this period (are active, are not released)
  const query = gql`
    query getLoans($endTime: Int!) {
      loans(first: $skip, where: { openedAt_lte: $endTime,  usesEscrow: true}) {
        underlyingAmount
        loansNFT {
          underlying
        }
        loanEscrow {
          escrow {
            feesHeld
            supplier
              offer {
                interestAPR
                lateFeeAPR
                totalEscrowed
                duration
                gracePeriod
              }
            createdAt
            expiration
          }
    }
      }
    }
  `;
  const data = await fetchAllSubgraphResults({
    url: BASE_MAINNET_SUBGRAPH_URL,
    query,
    field: 'loans',
    variables: {
      endTime
    }
  });
  return data;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplierAccruedFees = options.createBalances();
  const { fromTimestamp, toTimestamp } = options;

  const providerPositions = await revenue(fromTimestamp, toTimestamp);
  providerPositions.forEach((log: any) => {
    dailyFees.add(log.collarProviderNFT.cashAsset, log.protocolFeeAmount);
    dailyProtocolRevenue.add(log.collarProviderNFT.cashAsset, log.protocolFeeAmount);
  });

  const allEscrowLoansData = await allEscrowLoans(toTimestamp);

  allEscrowLoansData.forEach((log: any) => {
    const expiration = Number(log.loanEscrow.escrow.expiration);
    const gracePeriod = Number(log.loanEscrow.escrow.offer.gracePeriod); // the amount of time that will collect late fees (after this loan is seized)
    const createdAt = Number(log.loanEscrow.escrow.createdAt);
    // skip loan if its not accruing interest or late fees (expiration + graceperiod <fromTimestamp) (loan is not generating any fees and most likely seized)
    if (expiration + gracePeriod < fromTimestamp || createdAt > toTimestamp) {
      return;
    }

    const interestBips = BigInt(log.loanEscrow.escrow.offer.interestAPR);
    const lateFeeBips = BigInt(log.loanEscrow.escrow.offer.lateFeeAPR);
    const escrowedAmount = BigInt(log.loanEscrow.escrow.offer.totalEscrowed);

    const interestTimeElapsed = Math.min(toTimestamp, expiration) - Math.max(fromTimestamp, createdAt); // interest fees accrued during this period  
    const lateFeeTimeElapsed = Math.min(toTimestamp, expiration + gracePeriod) - Math.max(fromTimestamp, expiration); // late fees accrued during this period  

    const yearInSeconds = BigInt(365 * 24 * 3600);

    const interestAccrued = escrowedAmount * interestBips * (interestTimeElapsed > 0n ? BigInt(interestTimeElapsed) : 0n) / yearInSeconds / 10_000n;
    const lateFeeAccrued = escrowedAmount * lateFeeBips * (lateFeeTimeElapsed > 0n ? BigInt(lateFeeTimeElapsed) : 0n) / yearInSeconds / 10_000n;

    dailySupplierAccruedFees.add(log.loansNFT.underlying, interestAccrued + lateFeeAccrued);
    dailyFees.add(log.loansNFT.underlying, interestAccrued + lateFeeAccrued);
  });

  return { 
    dailyFees, 
    dailyRevenue: dailyProtocolRevenue, 
    dailyProtocolRevenue, 
    dailySupplySideRevenue: dailySupplierAccruedFees
  };
};

const methodology = {
  Fees: 'Interest and late fees accrued to the supplier',
  Revenue: 'Protocol share of the interest and late fees accrued',
  ProtocolRevenue: 'Protocol share of the interest and late fees accrued',
  SupplySideRevenue: 'Interest and late fees accrued to the supplier'
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    base: {
      fetch,
      start: '2025-04-16',
    }
  }
};

export default adapter;
