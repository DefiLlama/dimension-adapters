import { Adapter } from "../../adapters/types";
import { AVAX, OPTIMISM, FANTOM, HARMONY, ARBITRUM, ETHEREUM, POLYGON, CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";

import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import { V1Reserve, V2Reserve, V3Reserve } from "./types"
import { Chain } from "@defillama/sdk/build/general";

const poolIDs = {
  V1: '0x24a42fd28c976a61df5d00d0599c34c4f90748c8',
  V2: '0xb53c1a33016b2dc2ff3653530bff1848a515c8c5',
  V2_AMM: '0xacc030ef66f9dfeae9cbb0cd1b25654b82cfa8d5',
  V2_POLYGON: '0xd05e3e715d945b59290df0ae8ef85c1bdb684744',
  V2_AVALANCHE: '0xb6a86025f0fe1862b372cb0ca18ce3ede02a318f',
  V3: '0xa97684ead0e402dc232d5a977953df7ecbab3cdb',
  V3_ETH: '0x2f39d218133afab8f2b819b1066c7e434ad94e9e',
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
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/aave/protocol-multy-raw",
}

const v2Endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/aave/protocol-v2",
  [AVAX]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v2-avalanche',
  [POLYGON]: "https://api.thegraph.com/subgraphs/name/aave/aave-v2-matic"
};

const v3Endpoints = {
  [POLYGON]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
  [AVAX]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-avalanche',
  [ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
  [OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism',
  [FANTOM]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-fantom',
  [HARMONY]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-harmony',
  [CHAIN.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
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
    return async (timestamp: number) => {
      const todaysTimestamp = timestamp
      const yesterdaysTimestamp = timestamp - 60 * 60 * 24

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
        timestamp,
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
    return async (timestamp: number) => {
      const todaysTimestamp = timestamp
      const yesterdaysTimestamp = timestamp - 60 * 60 * 24

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
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};



const v3Reserves = async (graphUrls: ChainEndpoints, chain: string, timestamp: number) => {
  const graphQuery =
  `{
    reserves(where: { pool: "${chain === CHAIN.ETHEREUM ? poolIDs.V3_ETH : poolIDs.V3}" }) {
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
    return async (timestamp: number) => {
      const _timestamp = getTimestampAtStartOfNextDayUTC(timestamp);
      const todaysTimestamp = _timestamp
      const yesterdaysTimestamp = _timestamp - 60 * 60 * 24

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
      const dailyFee = feeBreakdown.depositorInterestUSD + feeBreakdown.outstandingTreasuryIncomeUSD + feeBreakdown.treasuryIncomeUSD
      const dailyRev = feeBreakdown.treasuryIncomeUSD + feeBreakdown.outstandingTreasuryIncomeUSD

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  breakdown: {
    // v1: {
    //   [ETHEREUM]: {
    //     fetch: v1Graphs(v1Endpoints)(ETHEREUM),
    //     start: 1578459600
    //   },
    // },
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
    }
  }
}

export default adapter;
