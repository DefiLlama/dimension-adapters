// The 18 current V7 vaults published at https://tickerspring.com/docs#contracts
// The public API also contains retired deployments; those are outside this adapter's scope.
// Deployment blocks verified with archive eth_getCode at block - 1 and block.
export const managedVaults: { vault: string; deploymentBlock: number }[] = [
  { vault: '0xF8DE3bC8F4e577Bc59f166b1DAA391c8C69c73D5', deploymentBlock: 60517277 }, // AMZN managed vault, V7
  { vault: '0x5eaD63f22B2cF752d0F4aE4bcA2BD51cf83A641e', deploymentBlock: 60518326 }, // AAPL managed vault, V7
  { vault: '0x6bAb969D9927c8B17BC9dd42851c7b96E014532d', deploymentBlock: 60519550 }, // AMD managed vault, V7
  { vault: '0xB20bb3f29cd2f85cF06C240cE3302698e27f221d', deploymentBlock: 60520538 }, // CRCL managed vault, V7
  { vault: '0x9A8D2bB5684D03aa661B86859b960eF9BBe5087b', deploymentBlock: 60521414 }, // GME managed vault, V7
  { vault: '0x605829eEb18BDdA45FC165A9d0cc19bFDEbF3A02', deploymentBlock: 60522335 }, // GOOGL managed vault, V7
  { vault: '0x70752181e01197bD2e52575d03b9c323ea8f26Bd', deploymentBlock: 60523536 }, // INTC managed vault, V7
  { vault: '0xE0d7196D0e7Bdd3b53a11970a4edfa327DB76456', deploymentBlock: 60525672 }, // META managed vault, V7
  { vault: '0x387f9820DB494eC1fAeb9105a3c9E6226caCb057', deploymentBlock: 60527134 }, // MSFT managed vault, V7
  { vault: '0x2f936437A681b89cccd98a74f02Ee5779F6B559D', deploymentBlock: 60528031 }, // MSTR managed vault, V7
  { vault: '0x3BB0a114C2e491520806d9a546e1D7f354241026', deploymentBlock: 60528961 }, // MU managed vault, V7
  { vault: '0xc5aF3186b7b207beDd865eCcf344F5f0C69CA876', deploymentBlock: 60529854 }, // NVDA managed vault, V7
  { vault: '0xD72F1596Bf2b787af95cfe2BBF792B75ADE9400c', deploymentBlock: 60537629 }, // PLTR managed vault, V7
  { vault: '0x3f70f06D6fB574731e789Ee03DFa4E8f60783dDf', deploymentBlock: 60539117 }, // QQQ managed vault, V7
  { vault: '0x8197D34E8ed1d261aC462d898083eCBf8d5254b9', deploymentBlock: 60540151 }, // SNDK managed vault, V7
  { vault: '0x03504EcAEB6302db390Aa676A2636cf764f279a2', deploymentBlock: 60541203 }, // SPCX managed vault, V7
  { vault: '0x21ff4df049143dC698761a07949bd3e769aA3787', deploymentBlock: 60542535 }, // SPY managed vault, V7
  { vault: '0x78814fdC1AfD07ae859409F44B5D57DeA6798eF6', deploymentBlock: 60543521 }, // TSLA managed vault, V7
];
