import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived } from '../helpers/token';

const FEE_WALLET = '0xC542C2F197c4939154017c802B0583C596438380';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const fees = await getETHReceived({ options, target: FEE_WALLET });
  const dailyFees = options.createBalances();
  dailyFees.add(fees, 'CowSwap Partner Fees');
  
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  }
}

const adapters: SimpleAdapter = {
  version: 1, // fee wallet received ETH on weekly basic, no need to use version 2
  fetch,
  start: '2025-05-21',
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.XDAI],
  methodology: {
    Fees: "All swap fees from Aave frontend using CowSwap integration.",
    UserFees: "Users pay 0.15%-0.25% per swap while swap tokens using Aave frontend.",
    Revenue: "All swap fees are collected as revenue.",
    ProtocolRevenue: "All revenue is collected by Aave Labs.",
    HoldersRevenue: "No revenue share to AAVE token holders.",
  },
  breakdownMethodology: {
    Fees: {
      'CowSwap Partner Fees': 'Swap fees from CowSwap frontedn integration.',
    },
    Revenue: {
      'CowSwap Partner Fees': 'Swap fees from CowSwap frontedn integration.',
    },
    ProtocolRevenue: {
      'CowSwap Partner Fees': 'Swap fees from CowSwap frontedn integration.',
    },
  }
}
export default adapters;
