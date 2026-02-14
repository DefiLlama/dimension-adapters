import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CallsParams } from "@defillama/sdk/build/types";
import { METRIC } from "../../helpers/metrics";

const ABI = {
  reserveInfo: "function reservesInfo() view returns (uint256, uint256, uint256, uint256)",
  poolReservesInfo: "function poolReservesInfo(address) view returns (uint256, uint256, uint256, uint256, uint256)",
  burnInfo: "function burnInfo(uint256) view returns (uint256, uint256, uint256)",
  currentBurnEpoch: "uint256:currentBurnEpoch",
}

export const fetchAjna = async (options: FetchOptions, factoryAddress: string, poolUtilsAddress: string, reserveInfoIndex: number, reserveInfoABI: string = ABI.reserveInfo) => {
  const AJNA_TOKEN = '0x9a96ec9B57Fb64FbC60B423d1f4da7691Bd35079'
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const pools: string[] = await options.api.call({ abi: 'address[]:getDeployedPoolsList', target: factoryAddress })

  const [quoteToken, quoteTokenScale, reserveInfoStart, reserveInfoEnd, poolReserveInfoStart, poolReserveInfoEnd, currentBurnEpochStart, currentBurnEpochEnd] = await Promise.all([
    options.api.multiCall({ abi: 'address:quoteTokenAddress', calls: pools }),
    options.api.multiCall({ abi: 'uint:quoteTokenScale', calls: pools }),
    options.fromApi.multiCall({ abi: reserveInfoABI, calls: pools, permitFailure: true }),
    options.toApi.multiCall({ abi: reserveInfoABI, calls: pools, permitFailure: true }),
    options.fromApi.multiCall({ abi: ABI.poolReservesInfo, calls: pools, target: poolUtilsAddress, permitFailure: true }),
    options.toApi.multiCall({ abi: ABI.poolReservesInfo, calls: pools, target: poolUtilsAddress, permitFailure: true }),
    options.fromApi.multiCall({ abi: ABI.currentBurnEpoch, calls: pools, permitFailure: true }),
    options.toApi.multiCall({ abi: ABI.currentBurnEpoch, calls: pools, permitFailure: true }),
  ])

  const poolsWithBurn: CallsParams[] = [];
  pools.forEach((v, i) => {
    if (reserveInfoStart[i] != null && poolReserveInfoStart[i] != null && currentBurnEpochStart[i] != null) {

      const totalInterestEarnedByLenders = reserveInfoEnd[i][reserveInfoIndex] - reserveInfoStart[i][reserveInfoIndex]
      if (totalInterestEarnedByLenders > 0) {
        dailySupplySideRevenue.add(quoteToken[i], totalInterestEarnedByLenders / quoteTokenScale[i], METRIC.BORROW_INTEREST)
      }

      const poolReserves = poolReserveInfoEnd[i][0] - poolReserveInfoStart[i][0];
      if (poolReserves > 0) {
        dailyFees.add(quoteToken[i], poolReserves / quoteTokenScale[i], "Reserve accumulation")
      }
      const hasBurn = currentBurnEpochEnd[i][0] - currentBurnEpochStart[i][0];
      if (hasBurn) {
        // collect all burn events to make a single multicall at the end
        poolsWithBurn.push({
          target: v,
          params: currentBurnEpochEnd[i][0]
        })
      }
    }
  })

  if (poolsWithBurn.length) {
    const poolsWithBurnBefore = poolsWithBurn.map((v) => ({
      target: v.target,
      params: v.params as number - 1
    }))
    const [burnAmountsBefore, burnAmountsNow] = await Promise.all([
      options.toApi.multiCall({ abi: ABI.burnInfo, calls: poolsWithBurnBefore, permitFailure: true }),
      options.toApi.multiCall({ abi: ABI.burnInfo, calls: poolsWithBurn, permitFailure: true }),
    ])

    poolsWithBurn.forEach((_, i) => {
      const totalBurn = burnAmountsNow[i][2] - burnAmountsBefore[i][2]
      if (totalBurn > 0) {
        dailyHoldersRevenue.add(AJNA_TOKEN, totalBurn, METRIC.TOKEN_BUY_BACK)
      }
    })
  }

  dailyFees.addBalances(dailySupplySideRevenue)
  dailyFees.addBalances(dailyHoldersRevenue)

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const fetch = async (options: FetchOptions) => {
  const POOL_UTILS = '0x154FFf344f426F99E328bacf70f4Eb632210ecdc'
  const FACTORY = '0xe6f4d9711121e5304b30ac2aae57e3b085ad3c4d'
  return fetchAjna(options, FACTORY, POOL_UTILS, 3)
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers for loans, with approximately 85-90% distributed to lenders",
    "Reserve accumulation": "Portion of borrow interest accumulated in pool reserves, approximately 10-15% of total interest, held for future token burns",
    [METRIC.TOKEN_BUY_BACK]: "AJNA token burns executed through reserve auctions, reducing circulating supply"
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "AJNA token burns funded by accumulated reserves through periodic auctions"
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest distributed to lenders who supply liquidity to lending pools"
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "AJNA token burns that reduce circulating supply, benefiting all token holders"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-07-04',
  methodology: {
    Fees: "Fees collected from borrowers, lenders, and penalties",
    Revenue: "~10-15% net interest margin + origination fees and penalties are used to burn AJNA token",
    ProtocolRevenue: "Protocol takes no direct fees",
    HoldersRevenue: "Accumulated fees in reserves are used for token burns by utilizing auctions",
    dailySupplySideRevenue: "~85-90% interest rate goes to lenders from borrowers"
  },
  breakdownMethodology,
};

export default adapter;
