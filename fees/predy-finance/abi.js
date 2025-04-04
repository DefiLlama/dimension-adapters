module.exports = {
  ControllerAbi: [
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_id",
          "type": "uint256"
        }
      ],
      "name": "getAsset",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "id",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "pairGroupId",
              "type": "uint256"
            },
            {
              "components": [
                {
                  "internalType": "address",
                  "name": "token",
                  "type": "address"
                },
                {
                  "internalType": "address",
                  "name": "supplyTokenAddress",
                  "type": "address"
                },
                {
                  "components": [
                    {
                      "internalType": "uint256",
                      "name": "totalCompoundDeposited",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "totalNormalDeposited",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "totalNormalBorrowed",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "assetScaler",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "assetGrowth",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "debtGrowth",
                      "type": "uint256"
                    }
                  ],
                  "internalType": "struct ScaledAsset.TokenStatus",
                  "name": "tokenStatus",
                  "type": "tuple"
                },
                {
                  "components": [
                    {
                      "internalType": "uint256",
                      "name": "baseRate",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "kinkRate",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "slope1",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "slope2",
                      "type": "uint256"
                    }
                  ],
                  "internalType": "struct InterestRateModel.IRMParams",
                  "name": "irmParams",
                  "type": "tuple"
                }
              ],
              "internalType": "struct DataType.AssetPoolStatus",
              "name": "stablePool",
              "type": "tuple"
            },
            {
              "components": [
                {
                  "internalType": "address",
                  "name": "token",
                  "type": "address"
                },
                {
                  "internalType": "address",
                  "name": "supplyTokenAddress",
                  "type": "address"
                },
                {
                  "components": [
                    {
                      "internalType": "uint256",
                      "name": "totalCompoundDeposited",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "totalNormalDeposited",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "totalNormalBorrowed",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "assetScaler",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "assetGrowth",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "debtGrowth",
                      "type": "uint256"
                    }
                  ],
                  "internalType": "struct ScaledAsset.TokenStatus",
                  "name": "tokenStatus",
                  "type": "tuple"
                },
                {
                  "components": [
                    {
                      "internalType": "uint256",
                      "name": "baseRate",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "kinkRate",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "slope1",
                      "type": "uint256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "slope2",
                      "type": "uint256"
                    }
                  ],
                  "internalType": "struct InterestRateModel.IRMParams",
                  "name": "irmParams",
                  "type": "tuple"
                }
              ],
              "internalType": "struct DataType.AssetPoolStatus",
              "name": "underlyingPool",
              "type": "tuple"
            },
            {
              "components": [
                {
                  "internalType": "uint256",
                  "name": "riskRatio",
                  "type": "uint256"
                },
                {
                  "internalType": "int24",
                  "name": "rangeSize",
                  "type": "int24"
                },
                {
                  "internalType": "int24",
                  "name": "rebalanceThreshold",
                  "type": "int24"
                }
              ],
              "internalType": "struct DataType.AssetRiskParams",
              "name": "riskParams",
              "type": "tuple"
            },
            {
              "components": [
                {
                  "internalType": "address",
                  "name": "uniswapPool",
                  "type": "address"
                },
                {
                  "internalType": "int24",
                  "name": "tickLower",
                  "type": "int24"
                },
                {
                  "internalType": "int24",
                  "name": "tickUpper",
                  "type": "int24"
                },
                {
                  "internalType": "uint64",
                  "name": "numRebalance",
                  "type": "uint64"
                },
                {
                  "internalType": "uint256",
                  "name": "totalAmount",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "borrowedAmount",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "lastRebalanceTotalSquartAmount",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "lastFee0Growth",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "lastFee1Growth",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "borrowPremium0Growth",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "borrowPremium1Growth",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "fee0Growth",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "fee1Growth",
                  "type": "uint256"
                },
                {
                  "components": [
                    {
                      "internalType": "int256",
                      "name": "positionAmount",
                      "type": "int256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "lastFeeGrowth",
                      "type": "uint256"
                    }
                  ],
                  "internalType": "struct Perp.PositionStatus",
                  "name": "rebalancePositionUnderlying",
                  "type": "tuple"
                },
                {
                  "components": [
                    {
                      "internalType": "int256",
                      "name": "positionAmount",
                      "type": "int256"
                    },
                    {
                      "internalType": "uint256",
                      "name": "lastFeeGrowth",
                      "type": "uint256"
                    }
                  ],
                  "internalType": "struct Perp.PositionStatus",
                  "name": "rebalancePositionStable",
                  "type": "tuple"
                },
                {
                  "internalType": "int256",
                  "name": "rebalanceFeeGrowthUnderlying",
                  "type": "int256"
                },
                {
                  "internalType": "int256",
                  "name": "rebalanceFeeGrowthStable",
                  "type": "int256"
                }
              ],
              "internalType": "struct Perp.SqrtPerpAssetStatus",
              "name": "sqrtAssetStatus",
              "type": "tuple"
            },
            {
              "internalType": "bool",
              "name": "isMarginZero",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "isIsolatedMode",
              "type": "bool"
            },
            {
              "internalType": "uint256",
              "name": "lastUpdateTimestamp",
              "type": "uint256"
            }
          ],
          "internalType": "struct DataType.PairStatus",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ],
  ERC20Abi: [
    {
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
}