export default {
  getReservesList: 'address[]:getReservesList',
  getReserveConfiguration: {
    "inputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      }
    ],
    "name": "getReserveConfigurationData",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "decimals",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "ltv",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "liquidationThreshold",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "liquidationBonus",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "reserveFactor",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "usageAsCollateralEnabled",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "borrowingEnabled",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "stableBorrowRateEnabled",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isFrozen",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  reserveDataUpdatedEvent: {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "reserve",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "liquidityRate",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stableBorrowRate",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "variableBorrowRate",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "liquidityIndex",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "variableBorrowIndex",
        "type": "uint256"
      }
    ],
    "name": "ReserveDataUpdated",
    "type": "event"
  },
  getReserveDataV2: {
    "inputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      }
    ],
    "name": "getReserveData",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "availableLiquidity",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalStableDebt",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalVariableDebt",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "liquidityRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "variableBorrowRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "stableBorrowRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "averageStableBorrowRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "liquidityIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "variableBorrowIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint40",
        "name": "lastUpdateTimestamp",
        "type": "uint40"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  getReserveDataV3: {
    "inputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      }
    ],
    "name": "getReserveData",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "unbacked",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "accruedToTreasuryScaled",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalAToken",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalStableDebt",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalVariableDebt",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "liquidityRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "variableBorrowRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "stableBorrowRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "averageStableBorrowRate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "liquidityIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "variableBorrowIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint40",
        "name": "lastUpdateTimestamp",
        "type": "uint40"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
}
