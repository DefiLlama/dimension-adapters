export const swapEventABI = {
    "type": "event",
    "name": "SpotSwapEvent",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct Spot.SpotSwapParams",
        "components": [
          {
            "name": "shove",
            "type": "bytes16",
            "internalType": "Quad"
          },
          {
            "name": "ofToken",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "limitPrice",
            "type": "bytes16",
            "internalType": "OptQuad"
          },
          {
            "name": "remainingAmount",
            "type": "bytes16",
            "internalType": "OptQuad"
          }
        ]
      },
      {
        "name": "receiver",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "swapped",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct UserPay.Info",
        "components": [
          {
            "name": "token0",
            "type": "bytes16",
            "internalType": "Quad"
          },
          {
            "name": "token1",
            "type": "bytes16",
            "internalType": "Quad"
          }
        ]
      }
    ],
    "anonymous": false
  };