import * as sdk from "@defillama/sdk";
import { AVAX, OPTIMISM, FANTOM, HARMONY, ARBITRUM, ETHEREUM, POLYGON, CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../../adapters/types";
import { V1Reserve, V2Reserve, V3Reserve } from "./types"
import { Chain } from "@defillama/sdk/build/general";

//POOL_ADDRESSES_PROVIDER available in https://github.com/bgd-labs/aave-address-book
//remember to lowercase
const poolIDs = {
  V1: '0x24a42fd28c976a61df5d00d0599c34c4f90748c8',
  V2: '0xb53c1a33016b2dc2ff3653530bff1848a515c8c5',
  V2_AMM: '0xacc030ef66f9dfeae9cbb0cd1b25654b82cfa8d5',
  V2_POLYGON: '0xd05e3e715d945b59290df0ae8ef85c1bdb684744',
  V2_AVALANCHE: '0xb6a86025f0fe1862b372cb0ca18ce3ede02a318f',
  V3: '0xa97684ead0e402dc232d5a977953df7ecbab3cdb', // arbitrum, Optimism, fantom, harmony, polygon, avalanche
  V3_ETH: '0x2f39d218133afab8f2b819b1066c7e434ad94e9e',
  V3_BNB: '0xff75b6da14ffbbfd355daf7a2731456b3562ba6d',
  V3_GNOSIS: '0x36616cf17557639614c1cddb356b1b83fc0b2132',
  V3_METIS: '0xb9fabd7500b2c6781c35dd48d54f81fc2299d7af',
  V3_BASE: '0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d',
  V3_SCROLL: '0x69850d0b276776781c063771b161bd8894bcdd04',
}
type THeader = {
  [s: string]: string;
}
const headers: THeader = {
  'origin': 'https://aave.com/',
  'referer': 'https://aave.com/',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const ONE_DAY = 24 * 60 * 60;

const v1Endpoints = {
  [ETHEREUM]: sdk.graph.modifyEndpoint('GJfRcmN4YAzKW3VH2ZKzTcWXjgtvkpAYSwFh1LfHsEuh'),
}

const v2Endpoints = {
  [ETHEREUM]: sdk.graph.modifyEndpoint('8wR23o1zkS4gpLqLNU4kG3JHYVucqGyopL5utGxP2q1N'),
  [AVAX]: sdk.graph.modifyEndpoint('EZvK18pMhwiCjxwesRLTg81fP33WnR6BnZe5Cvma3H1C'),
  [POLYGON]: sdk.graph.modifyEndpoint('H1Et77RZh3XEf27vkAmJyzgCME2RSFLtDS2f4PPW6CGp')
};

//V3 endpoints avilable here: https://github.com/aave/protocol-subgraphs
const v3Endpoints = {
  [POLYGON]: sdk.graph.modifyEndpoint('Co2URyXjnxaw8WqxKyVHdirq9Ahhm5vcTs4dMedAq211'),
  [AVAX]: sdk.graph.modifyEndpoint('2h9woxy8RTjHu1HJsCEnmzpPHFArU33avmUh4f71JpVn'),
  [ARBITRUM]: sdk.graph.modifyEndpoint('DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B'),
  [OPTIMISM]: sdk.graph.modifyEndpoint('DSfLz8oQBUeU5atALgUFQKMTSYV9mZAVYp4noLSXAfvb'),
  [FANTOM]: sdk.graph.modifyEndpoint('6L1vPqyE3xvkzkWjh6wUKc1ABWYYps5HJahoxhrv2PJn'),
  [HARMONY]: sdk.graph.modifyEndpoint('FifJapBdCqT9vgNqJ5axmr6eNyUpUSaRAbbZTfsViNsT'),
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('7Jk85XgkV1MQ7u56hD8rr65rfASbayJXopugWkUoBMnZ'),
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('HtcDaL8L8iZ2KQNNS44EBVmLruzxuNAz1RkBYdui1QUT'),
  [CHAIN.METIS]: 'https://metisapi.0xgraph.xyz/subgraphs/name/aave/protocol-v3-metis',
  [CHAIN.BASE]: 'https://api.goldsky.com/api/public/project_clk74pd7lueg738tw9sjh79d6/subgraphs/aave-v3-base/1.0.0/gn',
  [CHAIN.SCROLL]: 'https://api.goldsky.com/api/public/project_clk74pd7lueg738tw9sjh79d6/subgraphs/aave-v3-scroll/1.0.0/gn',
}


const v1Reserves = async (graphUrls: ChainEndpoints, chain: string, timestamp: number) => {
  const graphQuery = gql
  `{
    reserves(where: { pool: "${poolIDs.V1}" }) {
      id
      paramsHistory(
        where: { timestamp_lte: ${timestamp}, timestamp_gte: ${timestamp - ONE_DAY} },
        orderBy: "timestamp",
        orderDirection: "desc",
        first: 1
      ) {
        id
        priceInUsd
        reserve {
          decimals
          symbol
        }
        lifetimeFlashloanDepositorsFee
        lifetimeFlashloanProtocolFee
        lifetimeOriginationFee
        lifetimeDepositorsInterestEarned
      }
    }
  }`;

  const graphRes = await request(graphUrls[chain], graphQuery);
  const reserves = graphRes.reserves.map((r: any) => r.paramsHistory[0]).filter((r: any) => r)
  return reserves
}

const v1Graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ endTimestamp }: FetchOptions)  => {
      const todaysTimestamp = endTimestamp
      const yesterdaysTimestamp = endTimestamp - 60 * 60 * 24

      const todaysReserves: V1Reserve[] = await v1Reserves(graphUrls, chain, todaysTimestamp);
      const yesterdaysReserves: V1Reserve[] = await v1Reserves(graphUrls, chain, yesterdaysTimestamp);

      const dailyFee = todaysReserves.reduce((acc: number, reserve: V1Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = parseFloat(reserve.priceInUsd);

        const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - parseFloat(yesterdaysReserve.lifetimeDepositorsInterestEarned);
        const depositorInterestUSD = depositorInterest * priceInUsd / (10 ** reserve.reserve.decimals);

        const originationFees = parseFloat(reserve.lifetimeOriginationFee) - parseFloat(yesterdaysReserve.lifetimeOriginationFee);
        const originationFeesUSD = originationFees * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanDepositorsFees = parseFloat(reserve.lifetimeFlashloanDepositorsFee) - parseFloat(yesterdaysReserve.lifetimeFlashloanDepositorsFee);
        const flashloanDepositorsFeesUSD = flashloanDepositorsFees * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanProtocolFees = parseFloat(reserve.lifetimeFlashloanProtocolFee) - parseFloat(yesterdaysReserve.lifetimeFlashloanProtocolFee);
        const flashloanProtocolFeesUSD = flashloanProtocolFees * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc
          + depositorInterestUSD
          + originationFeesUSD
          + flashloanProtocolFeesUSD
          + flashloanDepositorsFeesUSD;
      }, 0);

      const dailyRev = todaysReserves.reduce((acc: number, reserve: V1Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = parseFloat(reserve.priceInUsd);

        const originationFees = parseFloat(reserve.lifetimeOriginationFee) - parseFloat(yesterdaysReserve.lifetimeOriginationFee);
        const originationFeesUSD = originationFees * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanProtocolFees = parseFloat(reserve.lifetimeFlashloanProtocolFee) - parseFloat(yesterdaysReserve.lifetimeFlashloanProtocolFee);
        const flashloanProtocolFeesUSD = flashloanProtocolFees * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc
          + originationFeesUSD
          + flashloanProtocolFeesUSD
      }, 0);

      return {
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
        dailyHoldersRevenue: '0',
      };
    };
  };
};


const v2Reserves = async (graphUrls: ChainEndpoints, poolId: string, chain: string, timestamp: number) => {
  const graphQuery = gql
  `{
    reserves(where: { pool: "${poolId}" }) {
        id
        paramsHistory(
          where: { timestamp_lte: ${timestamp}, timestamp_gte: ${timestamp - ONE_DAY} },
          orderBy: "timestamp",
          orderDirection: "desc",
          first: 1
        ) {
          id
          priceInEth
          priceInUsd
          reserve {
            decimals
            symbol
          }
          lifetimeFlashLoanPremium
          lifetimeReserveFactorAccrued
          lifetimeDepositorsInterestEarned
        }
      }
    }`;
  const graphRes = await request(graphUrls[chain], graphQuery, {}, headers);
  const reserves = graphRes.reserves.map((r: any) => r.paramsHistory[0]).filter((r: any) => r)
  return reserves
}

type TMap = {
  [s: string]: string[];
}
const blacklisted_v2_symbol: TMap = {
  [CHAIN.ETHEREUM]: ['AMPL'],
  [AVAX]: [],
  [POLYGON]: [],
}
const v2Graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ endTimestamp }: FetchOptions)  => {
      const todaysTimestamp = endTimestamp
      const yesterdaysTimestamp = endTimestamp - 60 * 60 * 24

      let poolID = poolIDs.V2
      if (chain == "avax") {
        poolID = poolIDs.V2_AVALANCHE
      } else if (chain == "polygon") {
        poolID = poolIDs.V2_POLYGON
      }

      const todaysReserves: V2Reserve[] = await v2Reserves(graphUrls, poolID, chain, todaysTimestamp);
      const yesterdaysReserves: V2Reserve[] = await v2Reserves(graphUrls, poolID, chain, yesterdaysTimestamp);

      let dailyFee = todaysReserves.reduce((acc: number, reserve: V2Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }
        if (blacklisted_v2_symbol[chain].includes(reserve.reserve.symbol)) return acc;

        const priceInUsd = chain == 'avax' ? parseFloat(reserve.priceInUsd) / (10 ** 8) : parseFloat(reserve.priceInUsd)

        const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - (parseFloat(yesterdaysReserve?.lifetimeDepositorsInterestEarned) || 0);
        const depositorInterestUSD = depositorInterest * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanPremium = parseFloat(reserve.lifetimeFlashLoanPremium) - (parseFloat(yesterdaysReserve?.lifetimeFlashLoanPremium) || 0);
        const flashloanPremiumUSD = flashloanPremium * priceInUsd / (10 ** reserve.reserve.decimals);

        const reserveFactor = parseFloat(reserve.lifetimeReserveFactorAccrued) - (parseFloat(yesterdaysReserve.lifetimeReserveFactorAccrued) || 0);
        const reserveFactorUSD = reserveFactor * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc
          + depositorInterestUSD
          + flashloanPremiumUSD
          + reserveFactorUSD;
      }, 0);

      let dailyRev = todaysReserves.reduce((acc: number, reserve: V2Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = chain == 'avax' ? parseFloat(reserve.priceInUsd) / (10 ** 8) : parseFloat(reserve.priceInUsd)

        const reserveFactor = parseFloat(reserve.lifetimeReserveFactorAccrued) - (parseFloat(yesterdaysReserve.lifetimeReserveFactorAccrued) || 0);
        const reserveFactorUSD = reserveFactor * priceInUsd / (10 ** reserve.reserve.decimals);

        return acc + reserveFactorUSD;
      }, 0);

      if (chain == "ethereum") {
        const ammPoolID = poolIDs.V2_AMM

        const ammTodaysReserves: V2Reserve[] = await v2Reserves(graphUrls, ammPoolID, chain, todaysTimestamp);
        const ammYesterdaysReserves: V2Reserve[] = await v2Reserves(graphUrls, ammPoolID, chain, yesterdaysTimestamp);

        dailyFee += ammTodaysReserves.reduce((acc: number, reserve: V2Reserve) => {
          const yesterdaysReserve = ammYesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

          if (!yesterdaysReserve) {
            return acc;
          }

          const priceInUsd = parseFloat(reserve.priceInUsd)

          const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - (parseFloat(yesterdaysReserve?.lifetimeDepositorsInterestEarned) || 0);
          const depositorInterestUSD = depositorInterest * priceInUsd / (10 ** reserve.reserve.decimals);

          const flashloanPremium = parseFloat(reserve.lifetimeFlashLoanPremium) - (parseFloat(yesterdaysReserve?.lifetimeFlashLoanPremium) || 0);
          const flashloanPremiumUSD = flashloanPremium * priceInUsd / (10 ** reserve.reserve.decimals);

          const reserveFactor = parseFloat(reserve.lifetimeReserveFactorAccrued) - (parseFloat(yesterdaysReserve.lifetimeReserveFactorAccrued) || 0);
          const reserveFactorUSD = reserveFactor * priceInUsd / (10 ** reserve.reserve.decimals);

          return acc
            + depositorInterestUSD
            + flashloanPremiumUSD
            + reserveFactorUSD;
        }, 0);

        dailyRev += ammTodaysReserves.reduce((acc: number, reserve: V2Reserve) => {
          const yesterdaysReserve = ammYesterdaysReserves.find((r: any) => r.reserve.symbol === reserve.reserve.symbol)

          if (!yesterdaysReserve) {
            return acc;
          }

          const priceInUsd = parseFloat(reserve.priceInUsd)

          const reserveFactor = parseFloat(reserve.lifetimeReserveFactorAccrued) - (parseFloat(yesterdaysReserve.lifetimeReserveFactorAccrued) || 0);
          const reserveFactorUSD = reserveFactor * priceInUsd / (10 ** reserve.reserve.decimals);

          return acc + reserveFactorUSD;
        }, 0);
      }

      return {
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};



const v3Reserves = async (graphUrls: ChainEndpoints, chain: string, timestamp: number) => {
  let poolid;
  if (chain === CHAIN.ETHEREUM) {
    poolid = poolIDs.V3_ETH;
  }
  else if (chain === CHAIN.BSC) {
    poolid = poolIDs.V3_BNB;
  }
  else if (chain === CHAIN.XDAI) {
    poolid = poolIDs.V3_GNOSIS;
  }
  else if (chain === CHAIN.METIS) {
    poolid = poolIDs.V3_METIS;
  }
  else if (chain === CHAIN.BASE) {
    poolid = poolIDs.V3_BASE;
  }
  else if (chain === CHAIN.SCROLL) {
    poolid = poolIDs.V3_SCROLL;
  }
  else {
    poolid= poolIDs.V3;
  }

  const graphQuery =
  `{
    reserves(where: { pool: "${poolid}" }) {
        id
        paramsHistory(
          where: { timestamp_lte: ${timestamp}, timestamp_gte: ${timestamp - ONE_DAY} },
          orderBy: "timestamp",
          orderDirection: "desc",
          first: 1
        ) {
          id
          priceInEth
          priceInUsd
          reserve {
            decimals
            symbol
            underlyingAsset
          }
          lifetimeFlashLoanLPPremium
          lifetimeFlashLoanProtocolPremium
          lifetimePortalLPFee
          lifetimePortalProtocolFee
          lifetimeReserveFactorAccrued
          lifetimeDepositorsInterestEarned: lifetimeSuppliersInterestEarned
          accruedToTreasury
        }
      }
    }`;
  const graphRes = await request(graphUrls[chain], graphQuery);
  const reserves = graphRes.reserves.map((r: any) => r.paramsHistory[0]).filter((r: any) => r)
  return reserves
}

const v3Graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ endTimestamp }: FetchOptions)  => {
      const todaysTimestamp = endTimestamp
      const yesterdaysTimestamp = endTimestamp - 60 * 60 * 24

      const todaysReserves: V3Reserve[] = await v3Reserves(graphUrls, chain, todaysTimestamp);
      const yesterdaysReserves: V3Reserve[] = await v3Reserves(graphUrls, chain, yesterdaysTimestamp);

      const feeBreakdown: any = todaysReserves.reduce((acc, reserve: V3Reserve) => {
        const yesterdaysReserve = yesterdaysReserves.find((r: any) => r.reserve.underlyingAsset === reserve.reserve.underlyingAsset)

        if (!yesterdaysReserve) {
          return acc;
        }

        const priceInUsd = parseFloat(reserve.priceInUsd) / (10 ** 8)

        const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - parseFloat(yesterdaysReserve?.lifetimeDepositorsInterestEarned);
        const depositorInterestUSD = depositorInterest * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanLPPremium = parseFloat(reserve.lifetimeFlashLoanLPPremium) - parseFloat(yesterdaysReserve.lifetimeFlashLoanLPPremium);
        const flashloanLPPremiumUSD = flashloanLPPremium * priceInUsd / (10 ** reserve.reserve.decimals);

        const flashloanProtocolPremium = parseFloat(reserve.lifetimeFlashLoanProtocolPremium) - parseFloat(yesterdaysReserve.lifetimeFlashLoanProtocolPremium);
        const flashloanProtocolPremiumUSD = flashloanProtocolPremium * priceInUsd / (10 ** reserve.reserve.decimals);

        const portalLPFee = parseFloat(reserve.lifetimePortalLPFee) - parseFloat(yesterdaysReserve?.lifetimePortalLPFee);
        const portalLPFeeUSD = portalLPFee * priceInUsd / (10 ** reserve.reserve.decimals);

        const portalProtocolFee = parseFloat(reserve.lifetimePortalProtocolFee) - parseFloat(yesterdaysReserve?.lifetimePortalProtocolFee);
        const portalProtocolFeeUSD = portalProtocolFee * priceInUsd / (10 ** reserve.reserve.decimals);

        const treasuryIncome = parseFloat(reserve.lifetimeReserveFactorAccrued) - parseFloat(yesterdaysReserve?.lifetimeReserveFactorAccrued);

        const outstandingTreasuryIncome = parseFloat(reserve.accruedToTreasury) - parseFloat(yesterdaysReserve?.accruedToTreasury);

        const treasuryIncomeUSD = treasuryIncome * priceInUsd / (10 ** reserve.reserve.decimals);

        const outstandingTreasuryIncomeUSD = outstandingTreasuryIncome * priceInUsd / (10 ** reserve.reserve.decimals);

        acc.outstandingTreasuryIncomeUSD += outstandingTreasuryIncomeUSD;
        acc.treasuryIncomeUSD += treasuryIncomeUSD;
        acc.depositorInterestUSD += depositorInterestUSD;
        acc.flashloanLPPremiumUSD += flashloanLPPremiumUSD;
        acc.flashloanProtocolPremiumUSD += flashloanProtocolPremiumUSD;
        acc.portalLPFeeUSD += portalLPFeeUSD;
        acc.portalProtocolFeeUSD += portalProtocolFeeUSD;
        return acc;
      }, {
        depositorInterestUSD: 0,
        flashloanLPPremiumUSD: 0,
        flashloanProtocolPremiumUSD: 0,
        portalLPFeeUSD: 0,
        portalProtocolFeeUSD: 0,
        treasuryIncomeUSD: 0,
        outstandingTreasuryIncomeUSD: 0
      });
      const dailyFee = feeBreakdown.depositorInterestUSD + feeBreakdown.treasuryIncomeUSD
      const dailyRev = feeBreakdown.treasuryIncomeUSD

      return {
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};

const adapter = {
  breakdown: {
//v1 subgraph no longer responding
//    v1: {
//      [ETHEREUM]: {
//        fetch: v1Graphs(v1Endpoints)(ETHEREUM),
//        start: 1578459600
//      },
//    },
    v2: {
      [AVAX]: {
        fetch: v2Graphs(v2Endpoints)(AVAX),
        start: 1606971600
      },
      [ETHEREUM]: {
        fetch: v2Graphs(v2Endpoints)(ETHEREUM),
        start: 1606971600
      },
      [POLYGON]: {
        fetch: v2Graphs(v2Endpoints)(POLYGON),
        start: 1606971600
      },
    },
    v3: {
      [AVAX]: {
        fetch: v3Graphs(v3Endpoints)(AVAX),
        start: 1647230400
      },
      [POLYGON]: {
        fetch: v3Graphs(v3Endpoints)(POLYGON),
        start: 1647230400
      },
      [ARBITRUM]: {
        fetch: v3Graphs(v3Endpoints)(ARBITRUM),
        start: 1647230400
      },
      [OPTIMISM]: {
        fetch: v3Graphs(v3Endpoints)(OPTIMISM),
        start: 1647230400
      },
      [FANTOM]: {
        fetch: v3Graphs(v3Endpoints)(FANTOM),
        start: 1647230400
      },
      [HARMONY]: {
        fetch: v3Graphs(v3Endpoints)(HARMONY),
        start: 1647230400
      },
      [CHAIN.ETHEREUM]: {
        fetch: v3Graphs(v3Endpoints)(CHAIN.ETHEREUM),
        start: 1647230400
      },
      [CHAIN.BSC]: {
        fetch: v3Graphs(v3Endpoints)(CHAIN.BSC),
        start: 1700222400
      },
      [CHAIN.XDAI]: {
        fetch: v3Graphs(v3Endpoints)(CHAIN.XDAI),
        start: 1696420800
      },
      [CHAIN.METIS]: {
        fetch: v3Graphs(v3Endpoints)(CHAIN.METIS),
        start: 1682164800
      },
      [CHAIN.BASE]: {
        fetch: v3Graphs(v3Endpoints)(CHAIN.BASE),
        start: 1691496000
      },
      [CHAIN.SCROLL]: {
        fetch: v3Graphs(v3Endpoints)(CHAIN.SCROLL),
        start: 1705741200
      },
    }
  },
  version: 2
}

export default adapter;
