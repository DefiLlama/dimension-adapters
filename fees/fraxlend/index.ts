import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const FUNCTION_ABI = {
  BORROW_ASSET: "function asset() view returns (address)",
  COLLATERAL_CONTRACT: "function collateralContract() view returns (address)",
  ALL_PAIRS: "function getAllPairAddresses() view returns (address[])",
  PAIRS_LENGTH: "function deployedPairsLength() view returns (uint256)",
  PAIR_AT: "function deployedPairsArray(uint256) view returns (address)"
};

const EVENT_ABI = {
  ADD_INTEREST: "event AddInterest(uint256 interestEarned, uint256 rate, uint256 deltaTime, uint256 feesAmount, uint256 feesShare)",
  ADD_INTEREST2: "event AddInterest(uint256 interestEarned, uint256 rate, uint256 feesAmount, uint256 feesShare)",
  LIQUIDATION: "event Liquidate (address indexed borrower, uint256 collateralForLiquidator, uint256 sharesToLiquidate, uint256 amountLiquidatorToRepay, uint256 feesAmount, uint256 sharesToAdjust, uint256 amountToAdjust)"
};

const LABELS = {
  BorrowInterest: 'Fraxlend Borrow Interest',
  LenderInterest: 'Fraxlend Lender Interest',
  InterestFee: 'Fraxlend Protocol Fee',
  LiquidationFee: 'Fraxlend Liquidation Fee',
}

const configs: { [key: string]: { registry: string, start: string } } = {
  [CHAIN.ETHEREUM]: {
    registry: '0xD6E9D27C75Afd88ad24Cd5EdccdC76fd2fc3A751',
    start: '2022-11-18',
  },
  [CHAIN.ARBITRUM]: {
    registry: '0x0bD2fFBcB0A17De2d5a543ec2D47C772eeaD316d',
    start: '2023-05-20',
  },
  [CHAIN.FRAXTAL]: {
    registry: '0x8c22EBc8f9B96cEac97EA21c53F3B27ef2F45e57',
    start: '2024-02-22',
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const registry = configs[options.chain].registry;

  // getAllPairAddresses returns the whole array in one call, but some registry
  // deployments revert on it. Fall back to enumerating pairs one-by-one via
  // deployedPairsLength + deployedPairsArray(index).
  const allPairs: string[] = await options.api.call({
    target: registry,
    abi: FUNCTION_ABI.ALL_PAIRS,
  });
  
  const borrowAssets = await options.api.multiCall({
    calls: allPairs,
    abi: FUNCTION_ABI.BORROW_ASSET,
    permitFailure: true,
  });
  const collateralAssets = await options.api.multiCall({
    calls: allPairs,
    abi: FUNCTION_ABI.COLLATERAL_CONTRACT,
    permitFailure: true,
  });

  for (let i = 0; i < allPairs.length; i++) {
    const asset = borrowAssets[i]
    const collateralContract = collateralAssets[i]
    if (asset && collateralContract) {
      const [interestOccuralLogs1, interestOccuralLogs2, liquidationLogs] = await Promise.all([
        options.getLogs({
          target: allPairs[i],
          eventAbi: EVENT_ABI.ADD_INTEREST,
        }),
        options.getLogs({
          target: allPairs[i],
          eventAbi: EVENT_ABI.ADD_INTEREST2,
        }),
        options.getLogs({
          target: allPairs[i],
          eventAbi: EVENT_ABI.LIQUIDATION,
        })
      ]);

      const interestOccuralLogs = interestOccuralLogs1.concat(interestOccuralLogs2);

      interestOccuralLogs.forEach((interest: any) => {
        dailyFees.add(asset, interest.interestEarned, LABELS.BorrowInterest);
        dailySupplySideRevenue.add(asset, interest.interestEarned, LABELS.LenderInterest);
        
        dailyFees.add(asset, interest.feesAmount, LABELS.BorrowInterest);
        dailyRevenue.add(asset, interest.feesAmount, LABELS.InterestFee);
      });

      liquidationLogs.forEach((liquidation: any) => {
        // fees in collateral asset
        dailyFees.add(collateralContract, liquidation.feesAmount, LABELS.LiquidationFee);
        dailyRevenue.add(collateralContract, liquidation.feesAmount, LABELS.LiquidationFee);
      });
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  pullHourly: true,
  version: 2,
  fetch,
  adapter: configs,
  methodology: {
    Fees: 'Includes Lenders interest, liquidation fee and 10% interest fee',
    Revenue: '10% interest fee is considered as revenue',
    ProtocolRevenue: 'All the interest earned by lenders',
    SupplySideRevenue: 'All the interest earned by lenders',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.LenderInterest]: 'Interest earned by lenders.',
      [LABELS.InterestFee]: '10% interest fee collected by the protocol.',
      [LABELS.LiquidationFee]: 'Liquidation fees paid in the collateral asset.',
    },
    Revenue: {
      [LABELS.InterestFee]: '10% interest fee collected by the protocol.',
      [LABELS.LiquidationFee]: 'Liquidation fees collected by protocol.',
    },
    ProtocolRevenue: {
      [LABELS.InterestFee]: '10% interest fee collected by the protocol.',
      [LABELS.LiquidationFee]: 'Liquidation fees collected by protocol.',
    },
    SupplySideRevenue: {
      [LABELS.LenderInterest]: 'Interest earned by lenders.',
    },
  },
};

export default adapter;
