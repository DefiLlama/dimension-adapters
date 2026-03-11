import { CHAIN } from "./chains";
import { BaseAdapterChainConfig, FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";

interface FraxlenExportConfigs {
  protocolRevenueRatioFromRevenue: number;

  // chain => registry address
  registries: {
    [key: string]: string;
  }
}

const FUNCTION_ABI = {
  BORROW_ASSET: "function asset() view returns (address)",
  COLLATERAL_CONTRACT: "function collateralContract() view returns (address)",
  ALL_PAIRS: "function getAllPairAddresses() view returns (address[])"
};

const EVENT_ABI = {
  ADD_INTEREST: "event AddInterest(uint256 interestEarned, uint256 rate, uint256 deltaTime, uint256 feesAmount, uint256 feesShare)",
  ADD_INTEREST2: "event AddInterest(uint256 interestEarned, uint256 rate, uint256 feesAmount, uint256 feesShare)",
  LIQUIDATION: "event Liquidate (address indexed borrower, uint256 collateralForLiquidator, uint256 sharesToLiquidate, uint256 amountLiquidatorToRepay, uint256 feesAmount, uint256 sharesToAdjust, uint256 amountToAdjust)"
};

const getFees = async (options: FetchOptions, configs: FraxlenExportConfigs) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const allPairs = await options.api.call({
    target: configs.registries[options.chain],
    abi: FUNCTION_ABI.ALL_PAIRS,
  });

  await Promise.all(
    allPairs.map(async (pairAddress: string) => {
      const [asset, collateralContract, interestOccuralLogs1, interestOccuralLogs2, liquidationLogs] = await Promise.all([
        options.api.call({
          target: pairAddress,
          abi: FUNCTION_ABI.BORROW_ASSET,
        }),
        options.api.call({
          target: pairAddress,
          abi: FUNCTION_ABI.COLLATERAL_CONTRACT,
        }),
        options.getLogs({
          target: pairAddress,
          eventAbi: EVENT_ABI.ADD_INTEREST,
        }),
        options.getLogs({
          target: pairAddress,
          eventAbi: EVENT_ABI.ADD_INTEREST2,
        }),
        options.getLogs({
          target: pairAddress,
          eventAbi: EVENT_ABI.LIQUIDATION,
        })
      ]);

      const interestOccuralLogs = interestOccuralLogs1.length > 0 ? interestOccuralLogs1 : interestOccuralLogs2;

      interestOccuralLogs.forEach((interest) => {
        dailySupplySideRevenue.add(asset, interest.interestEarned);
        dailyRevenue.add(asset, interest.feesAmount);
      });

      liquidationLogs.forEach(liquidation => {
        // fees in collateral asset
        dailyFees.add(collateralContract, liquidation.feesAmount);
      });
    })
  );

  dailyFees.add(dailyRevenue);
  dailyFees.add(dailySupplySideRevenue);
  
  return {
    dailyFees,
    dailyRevenue,
    
    dailySupplySideRevenue
  };
}

export function fraxlendExport(exportConfig: FraxlenExportConfigs) {
  const adapter: SimpleAdapter = {
    pullHourly: true,
    version: 2,
    methodology: {
      Fees: 'Includes Lenders interest, liquidation fee and 10% interest fee',
      Revenue: '10% interest fee is considered as revenue',
      ProtocolRevenue: 'All the interest earned by lenders',
      SupplySideRevenue: 'All the interest earned by lenders',
    },
    fetch: (async (options: FetchOptions) => {
      const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getFees(options, exportConfig)

      return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue.clone(exportConfig.protocolRevenueRatioFromRevenue),
        dailySupplySideRevenue,
      }
    }),
    chains: Object.keys(exportConfig.registries),
  }
  return adapter
}
