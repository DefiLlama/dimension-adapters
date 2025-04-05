module.exports = {
  ControllerAbi: [
    {
      name: "getAsset",
      type: "function", 
      inputs: [{ name: "_id", type: "uint256" }],
      outputs: [{
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "pairGroupId", type: "uint256" },
          { 
            name: "stablePool", 
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "supplyTokenAddress", type: "address" },
              { 
                name: "tokenStatus", 
                type: "tuple",
                components: [
                  { name: "totalCompoundDeposited", type: "uint256" },
                  { name: "totalNormalDeposited", type: "uint256" },
                  { name: "totalNormalBorrowed", type: "uint256" },
                  { name: "assetScaler", type: "uint256" },
                  { name: "assetGrowth", type: "uint256" },
                  { name: "debtGrowth", type: "uint256" }
                ]
              },
              { 
                name: "irmParams", 
                type: "tuple",
                components: [
                  { name: "baseRate", type: "uint256" },
                  { name: "kinkRate", type: "uint256" },
                  { name: "slope1", type: "uint256" },
                  { name: "slope2", type: "uint256" }
                ]
              }
            ]
          },
          { 
            name: "underlyingPool", 
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "supplyTokenAddress", type: "address" },
              { 
                name: "tokenStatus", 
                type: "tuple",
                components: [
                  { name: "totalCompoundDeposited", type: "uint256" },
                  { name: "totalNormalDeposited", type: "uint256" },
                  { name: "totalNormalBorrowed", type: "uint256" },
                  { name: "assetScaler", type: "uint256" },
                  { name: "assetGrowth", type: "uint256" },
                  { name: "debtGrowth", type: "uint256" }
                ]
              },
              { 
                name: "irmParams", 
                type: "tuple",
                components: [
                  { name: "baseRate", type: "uint256" },
                  { name: "kinkRate", type: "uint256" },
                  { name: "slope1", type: "uint256" },
                  { name: "slope2", type: "uint256" }
                ]
              }
            ]
          },
          {
            name: "riskParams",
            type: "tuple",
            components: [
              { name: "riskRatio", type: "uint256" },
              { name: "rangeSize", type: "int24" },
              { name: "rebalanceThreshold", type: "int24" }
            ]
          },
          {
            name: "sqrtAssetStatus",
            type: "tuple",
            components: [
              { name: "uniswapPool", type: "address" },
              { name: "tickLower", type: "int24" },
              { name: "tickUpper", type: "int24" },
              { name: "numRebalance", type: "uint64" },
              { name: "totalAmount", type: "uint256" },
              { name: "borrowedAmount", type: "uint256" },
              { name: "lastRebalanceTotalSquartAmount", type: "uint256" },
              { name: "lastFee0Growth", type: "uint256" },
              { name: "lastFee1Growth", type: "uint256" },
              { name: "borrowPremium0Growth", type: "uint256" },
              { name: "borrowPremium1Growth", type: "uint256" },
              { name: "fee0Growth", type: "uint256" },
              { name: "fee1Growth", type: "uint256" },
              { 
                name: "rebalancePositionUnderlying",
                type: "tuple",
                components: [
                  { name: "positionAmount", type: "int256" },
                  { name: "lastFeeGrowth", type: "uint256" }
                ]
              },
              { 
                name: "rebalancePositionStable",
                type: "tuple",
                components: [
                  { name: "positionAmount", type: "int256" },
                  { name: "lastFeeGrowth", type: "uint256" }
                ]
              },
              { name: "rebalanceFeeGrowthUnderlying", type: "int256" },
              { name: "rebalanceFeeGrowthStable", type: "int256" }
            ]
          },
          { name: "isMarginZero", type: "bool" },
          { name: "isIsolatedMode", type: "bool" },
          { name: "lastUpdateTimestamp", type: "uint256" }
        ]
      }],
      stateMutability: "view"
    }
  ],
  ERC20Abi: [
    {
      name: "totalSupply",
      type: "function",
      inputs: [],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view"
    }
  ]
}