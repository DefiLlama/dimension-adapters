import { compoundV2Export, } from "../helpers/compoundV2";

export default compoundV2Export(
  {
    // lac: '0x123Abe3A273FDBCeC7fc0EBedc05AaeF4eE63060',
    ethereum: '0x0b9af1fd73885aD52680A1aeAa7A3f17AC702afA',
    wc: '0x589d63300976759a0fc74ea6fA7D951f581252D7',
  },
  { 
    protocolRevenueRatio: 1,
    blacklists: [
      '0xbaa6bc4e24686d710b9318b49b0bb16ec7c46bfa',
    ],
  }
);
