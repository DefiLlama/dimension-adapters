import { CHAIN } from "../../helpers/chains";

interface ChainConfig {
  swapManager: string;
  positionManager: string;
  start: number;
  tokens: string[]
}

const config: { [chain: string]: ChainConfig } = {
  [CHAIN.POLYGON]: {
    swapManager: '0x0AaDC2Eae6963ED983d85cbF088b0c294f4c26ff',
    positionManager: '0x02bcaA4633E466d151b34112608f60A82a4F6035',
    start: 1697673600,
    tokens: [
      '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    ]
  }
}

const topics = {
  swap: '0x5fcf6637f014854f918b233372226c5492e6a5157e517674a8588675550c40c6',
  openPosition: '0x3f505465ce78d219c28bcf9bed881a651c4800d1161454b0d5c93225196e7b8e',
  partiallyClosePosition: '0xda47f84a849dfb28125ae28a0bf305b75e72bff27796fc4bca36e2f848b0a0e6',
  closePosition: '0x4a06c6510972c5a49ff5582d7d8e59f20228038c8cb9ea05d78f02ac7ee40662'
}

const abi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "trader",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "tokenA",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "tokenB",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountSold",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountBought",
        "type": "uint256"
      }
    ],
    "name": "SpotSwap",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "positionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "trader",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "openedBy",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "scaledDebtAmount",
            "type": "uint256"
          },
          {
            "internalType": "contract IBucket",
            "name": "bucket",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "soldAsset",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "depositAmountInSoldAsset",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "positionAsset",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "positionAmount",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "trader",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "openBorrowIndex",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "createdAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "updatedConditionsAt",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "extraParams",
            "type": "bytes"
          }
        ],
        "indexed": false,
        "internalType": "struct PositionLibrary.Position",
        "name": "position",
        "type": "tuple"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "feeToken",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "protocolFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "entryPrice",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "leverage",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "managerType",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "params",
            "type": "bytes"
          }
        ],
        "indexed": false,
        "internalType": "struct LimitOrderLibrary.Condition[]",
        "name": "closeConditions",
        "type": "tuple[]"
      }
    ],
    "name": "OpenPosition",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "positionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "trader",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "closedBy",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "bucketAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "soldAsset",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "positionAsset",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "decreasePositionAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "profit",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "positionDebt",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum PositionLibrary.CloseReason",
        "name": "reason",
        "type": "uint8"
      }
    ],
    "name": "ClosePosition",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "positionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "trader",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "bucketAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "soldAsset",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "positionAsset",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "decreasePositionAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "depositedAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "scaledDebtAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "profit",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "positionDebt",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "name": "PartialClosePosition",
    "type": "event"
  }
]

export { config, topics, abi }