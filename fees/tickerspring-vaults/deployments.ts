import ADDRESSES from '../../helpers/coreAssets.json'
// V7 vault inventory: https://tickerspring.com/docs#contracts
// Token pairs: https://api.tickerspring.com/v1/public/vaults
export const managedVaults = [
  {
    "vault": "0xF8DE3bC8F4e577Bc59f166b1DAA391c8C69c73D5",
    "deploymentBlock": 60517277,
    "token0": ADDRESSES.robinhood.AMZN,
    "token1": ADDRESSES.robinhood.USDG
  },
  {
    "vault": "0x5eaD63f22B2cF752d0F4aE4bcA2BD51cf83A641e",
    "deploymentBlock": 60518326,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": ADDRESSES.robinhood.AAPL
  },
  {
    "vault": "0x6bAb969D9927c8B17BC9dd42851c7b96E014532d",
    "deploymentBlock": 60519550,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": ADDRESSES.robinhood.AMD
  },
  {
    "vault": "0xB20bb3f29cd2f85cF06C240cE3302698e27f221d",
    "deploymentBlock": 60520538,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5"
  },
  {
    "vault": "0x9A8D2bB5684D03aa661B86859b960eF9BBe5087b",
    "deploymentBlock": 60521414,
    "token0": "0x1b0E319c6A659F002271B69dB8A7df2F911c153E",
    "token1": ADDRESSES.robinhood.USDG
  },
  {
    "vault": "0x605829eEb18BDdA45FC165A9d0cc19bFDEbF3A02",
    "deploymentBlock": 60522335,
    "token0": ADDRESSES.robinhood.GOOGL,
    "token1": ADDRESSES.robinhood.USDG
  },
  {
    "vault": "0x70752181e01197bD2e52575d03b9c323ea8f26Bd",
    "deploymentBlock": 60523536,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681"
  },
  {
    "vault": "0xE0d7196D0e7Bdd3b53a11970a4edfa327DB76456",
    "deploymentBlock": 60525672,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": ADDRESSES.robinhood.META
  },
  {
    "vault": "0x387f9820DB494eC1fAeb9105a3c9E6226caCb057",
    "deploymentBlock": 60527134,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": "0xe93237C50D904957Cf27E7B1133b510C669c2e74"
  },
  {
    "vault": "0x2f936437A681b89cccd98a74f02Ee5779F6B559D",
    "deploymentBlock": 60528031,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": ADDRESSES.robinhood.MSTR
  },
  {
    "vault": "0x3BB0a114C2e491520806d9a546e1D7f354241026",
    "deploymentBlock": 60528961,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": ADDRESSES.robinhood.MU
  },
  {
    "vault": "0xc5aF3186b7b207beDd865eCcf344F5f0C69CA876",
    "deploymentBlock": 60529854,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": ADDRESSES.robinhood.NVDA
  },
  {
    "vault": "0xD72F1596Bf2b787af95cfe2BBF792B75ADE9400c",
    "deploymentBlock": 60537629,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A"
  },
  {
    "vault": "0x3f70f06D6fB574731e789Ee03DFa4E8f60783dDf",
    "deploymentBlock": 60539117,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68"
  },
  {
    "vault": "0x8197D34E8ed1d261aC462d898083eCBf8d5254b9",
    "deploymentBlock": 60540151,
    "token0": ADDRESSES.robinhood.USDG,
    "token1": ADDRESSES.robinhood.SNDK
  },
  {
    "vault": "0x03504EcAEB6302db390Aa676A2636cf764f279a2",
    "deploymentBlock": 60541203,
    "token0": ADDRESSES.robinhood.SPCX,
    "token1": ADDRESSES.robinhood.USDG
  },
  {
    "vault": "0x21ff4df049143dC698761a07949bd3e769aA3787",
    "deploymentBlock": 60542535,
    "token0": "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    "token1": ADDRESSES.robinhood.USDG
  },
  {
    "vault": "0x78814fdC1AfD07ae859409F44B5D57DeA6798eF6",
    "deploymentBlock": 60543521,
    "token0": ADDRESSES.robinhood.TSLA,
    "token1": ADDRESSES.robinhood.USDG
  }
] as const;
