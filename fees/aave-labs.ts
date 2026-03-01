import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived } from '../helpers/token';

const FEE_WALLET = '0xC542C2F197c4939154017c802B0583C596438380';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({ options, target: FEE_WALLET });
  
  return { dailyFees }
}

const adapters: SimpleAdapter = {
  version: 2,
  fetch,
  start: '2025-05-21',
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.XDAI],
  methodology: {
    Fees: "All swap fees from Aave frontend using CowSwap integration.",
    UserFees: "Users pay 0.15%-0.25% per swap while swap tokens using Aave frontend.",
    Revenue: "All swap fees are collected as revenue.",
    ProtocolRevenue: "All revenue are collected by Aave Labs.",
  },
}
export default adapters;
