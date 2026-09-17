// Maintained deployment inventory: https://api.tickerspring.com/v1/public/vaults
// Includes retired entries so removing a vault from the UI cannot erase historical fees.
// Deployment blocks verified with archive eth_getCode at block - 1 and block.
// V7 addresses and verified sources: https://tickerspring.com/docs#contracts
export const managedVaults: { vault: string; deploymentBlock: number }[] = [
  { vault: '0xD1815552C0ab562AcC029cde8e88EeEe23E2755D', deploymentBlock: 58974716 }, // TSLA managed vault, V2
  { vault: '0xD735F6B0C6CC91eD4BbCEb4825c737aAb5dA4bC1', deploymentBlock: 59303814 }, // AAPL managed vault, V3
  { vault: '0x62b1D0629c39fB338a4C37563683C54D423fbD37', deploymentBlock: 59312608 }, // TSLA managed vault, V3
  { vault: '0x5f6D5d6A42b9Ca1a765009ddE5c23a68DE8474BD', deploymentBlock: 59370519 }, // GOOGL managed vault, V3
  { vault: '0x7E5a032b5c207D8f14cD4701b04eEfFABc0cd0Fb', deploymentBlock: 59383256 }, // AMD managed vault, V3
  { vault: '0x90FeFBE8588C73F74f9D63C0c5028928B46d71BF', deploymentBlock: 59395572 }, // INTC managed vault, V3
  { vault: '0xA53A6069A5E9a39c4DEC16d2407E591E79b13A42', deploymentBlock: 59399658 }, // META managed vault, V3
  { vault: '0xeeC96aad21D01cC8e472F67caB6CE298f03ba32e', deploymentBlock: 59419046 }, // PLTR managed vault, V3
  { vault: '0xaF49E4BDF364E68d57CFA012D6b2Ef0ad4f13c59', deploymentBlock: 59426120 }, // SNDK managed vault, V3
  { vault: '0xFb68496C5aAC68ef2191d92b48eb32Aa7164C231', deploymentBlock: 59429715 }, // MSTR managed vault, V3
  { vault: '0x515598C6B0be76A95B4712563636B065D272b1ED', deploymentBlock: 59767749 }, // AAPL managed vault, V5
  { vault: '0xD1C226886542B4591890705EF517B7cAbA715941', deploymentBlock: 59768122 }, // AMD managed vault, V5
  { vault: '0xD7d3cf76d1cd619aE3E91e1D862e241BeAE6a0E0', deploymentBlock: 59768463 }, // GOOGL managed vault, V5
  { vault: '0xA04DD34a3AbC7061869798FeB394920A422E6924', deploymentBlock: 59768776 }, // INTC managed vault, V5
  { vault: '0xCeb0212B9E405AA0064186C0a70E31f6e5d821D6', deploymentBlock: 59769088 }, // META managed vault, V5
  { vault: '0x476518C2FC76958FCDA236D1C3E8FB242aEEF33f', deploymentBlock: 59769356 }, // MSTR managed vault, V5
  { vault: '0x7f7c74Bf4B193E6F527A8bA04f6C74f8d2190D53', deploymentBlock: 59769632 }, // PLTR managed vault, V5
  { vault: '0x771C170DcF7914255e4099fcDDAcA48d423656cd', deploymentBlock: 59769942 }, // SNDK managed vault, V5
  { vault: '0x4dA3CbA2A86FF9Db1D2AD1f692Cf59EF2b5DC9Ca', deploymentBlock: 59770216 }, // TSLA managed vault, V5
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

export const legacyVaults = [
  '0x203c1FC55C61584057Bd1FFAb73644a2039005F9', // basket
  '0x5E87cDCf21A026ACA89173e8b24BB00a165A4A4b', // single
];
