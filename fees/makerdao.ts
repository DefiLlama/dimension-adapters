import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import BigNumber from "bignumber.js";

const RAY = new BigNumber(10).pow(27);

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/protofire/maker-protocol"
}

// Source: https://makerburn.com/#/rundown
const collateralYields = {
  "RWA007-A": 4,
  "RWA009-A": 0.11,
  "RWA010-A": 4,
  "RWA011-A": 4,
  "RWA014-A": 2.6,
  "RWA015-A": 4.5,
  "PSM-GUSD-A": 2,
} as {
  [rwa:string]:number
}

const MCD_POT={
  address: '0x197e90f9fad81970ba7976f33cbd77088e5d7cf7',
  abis: {
    Pie: {"constant":true,"inputs":[],"name":"Pie","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
    dsr: {"constant":true,"inputs":[],"name":"dsr","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
    chi: {"constant":true,"inputs":[],"name":"chi","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
  } as any
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({getEndBlock, getStartBlock, startTimestamp, endTimestamp, toApi} : FetchOptions) => {
      const graphQuery = gql
      `query fees {
        yesterday: collateralTypes(block: {number: ${await getStartBlock()}}) {
          id
          totalDebt
          stabilityFee
        }
        today: collateralTypes(block: {number: ${await getEndBlock()}}) {
          id
          totalDebt
          stabilityFee
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const secondsBetweenDates = endTimestamp - startTimestamp;
      
      const todayDebts: { [id: string]: BigNumber } = {};
      let dailyFee = new BigNumber(0)

      for (const collateral of graphRes["today"]) {
        todayDebts[collateral.id] = new BigNumber(collateral["totalDebt"]);
      }

      for (const collateral of graphRes["yesterday"]) {
        if (todayDebts[collateral.id]) {
          const avgDebt = todayDebts[collateral.id].plus(new BigNumber(collateral["totalDebt"])).div(2)
          let accFees = new BigNumber(Math.pow(collateral["stabilityFee"], secondsBetweenDates) - 1)
          if(collateralYields[collateral.id]){
            accFees = new BigNumber(collateralYields[collateral.id]/365e2)
          }
          dailyFee = dailyFee.plus(avgDebt.multipliedBy(accFees))
        }
      }
      const sparkSupplyAPR = await toApi.call({target: "0xC13e21B648A5Ee794902342038FF3aDAB66BE987", params: ["0x6B175474E89094C44Da98b954EedeAC495271d0F"], abi:{"inputs":[{"internalType":"address","name":"asset","type":"address"}],"name":"getReserveData","outputs":[{"components":[{"components":[{"internalType":"uint256","name":"data","type":"uint256"}],"internalType":"struct DataTypes.ReserveConfigurationMap","name":"configuration","type":"tuple"},{"internalType":"uint128","name":"liquidityIndex","type":"uint128"},{"internalType":"uint128","name":"currentLiquidityRate","type":"uint128"},{"internalType":"uint128","name":"variableBorrowIndex","type":"uint128"},{"internalType":"uint128","name":"currentVariableBorrowRate","type":"uint128"},{"internalType":"uint128","name":"currentStableBorrowRate","type":"uint128"},{"internalType":"uint40","name":"lastUpdateTimestamp","type":"uint40"},{"internalType":"uint16","name":"id","type":"uint16"},{"internalType":"address","name":"aTokenAddress","type":"address"},{"internalType":"address","name":"stableDebtTokenAddress","type":"address"},{"internalType":"address","name":"variableDebtTokenAddress","type":"address"},{"internalType":"address","name":"interestRateStrategyAddress","type":"address"},{"internalType":"uint128","name":"accruedToTreasury","type":"uint128"},{"internalType":"uint128","name":"unbacked","type":"uint128"},{"internalType":"uint128","name":"isolationModeTotalDebt","type":"uint128"}],"internalType":"struct DataTypes.ReserveData","name":"","type":"tuple"}],"stateMutability":"view","type":"function"}})
      const sparkSupply = await toApi.call({target: "0x4dedf26112b3ec8ec46e7e31ea5e123490b05b8b", params: ["0xAfA2DD8a0594B2B24B59de405Da9338C4Ce23437"], abi:"erc20:balanceOf"})
      const SECONDS_IN_YEAR = 365*24*60*60
      const sparkSupplyAPY = (sparkSupplyAPR.currentLiquidityRate/1e27 / SECONDS_IN_YEAR + 1)**(24*3600) - 1
      
      dailyFee = dailyFee.plus(sparkSupplyAPY*sparkSupply/1e18)

      const [Pie, chi, dsr] = await Promise.all(["Pie", "chi", "dsr"].map(async name=>(
        await toApi.call({
          target: MCD_POT.address,
          abi: MCD_POT.abis[name],
        })
      )))
      const dsrTvl = BigNumber(Pie).times(chi).div(1e18).div(RAY) // check against https://makerburn.com/#/
      const dsrExpenses = BigNumber(dsr).div(RAY).pow(60*60*24).minus(1).times(dsrTvl)

      return {
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.minus(dsrExpenses).toString(),
      };
    };
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: 1573672933,
    },
  }
}

export default adapter;
