import { CHAIN } from "../../helpers/chains";

interface ChainConfig {
  swapManager: string[];
  positionManager: string[];
  batchManager: string[];
  start: number;
}

const config: { [chain: string]: ChainConfig } = {
  [CHAIN.POLYGON]: {
    swapManager: ['0x0AaDC2Eae6963ED983d85cbF088b0c294f4c26ff', '0xA0069a14Df3ECd19a38c509757eBc2C2Aaa44992'],
    positionManager: ['0x02bcaA4633E466d151b34112608f60A82a4F6035'],
    batchManager: ['0xC6B1AF3dEb9E379ccADF2Fa21263a50E91F4776C', '0xc10771D8f5B6Ba702E3a44EC76969f07578F08b7'],
    start: 1697587200,
  },
  [CHAIN.ARBITRUM]: {
    swapManager: ['0xbE3de856EB22bf6EFA03DD55e65DF22bA212e6Db'],
    positionManager: ['0x86890E30cE9E1e13Db5560BbEb435c55567Af1cd'],
    batchManager: ['0xF2225a8f90311DaF9e989db1AfFd47617bb69E96'],
    start: 1700611200,
  },
  [CHAIN.ETHEREUM]: {
    swapManager: ['0xa6d76535e265357187653d4AAd9b362404D42EA8'],
    positionManager: ['0x99d63fEA4b3Ef6ca77941df3C5740dAd1586f0B8'],
    batchManager: ['0x1da9c104C517C7b4465c8Eef458Da0a6c61835Fe'],
    start: 1702771200,
  },
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