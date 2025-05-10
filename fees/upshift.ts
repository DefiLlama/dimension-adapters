import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const VAULTS = [
  {address:"0xd684af965b1c17d628ee0d77cae94259c41260f4",feeToken:"0x9d39a5de30e57443bff2a8307a4256c8797a3497"}, //Susd
  {address:"0x5Fde59415625401278c4d41C6beFCe3790eb357f",feeToken:"0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0"},//Treehouse
  {address:"0x18a5a3D575F34e5eBa92ac99B0976dBe26f9F869",feeToken:"0x8236a87084f8b84306f72007f36f2618a5634494"},//LBTC
  {address:"0xB2bFb52cfc40584AC4e9e2B36a5B8d6554A56e0b",feeToken:"0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"},//Avax
  {address:"0x4e2D90f0307A93b54ACA31dc606F93FE6b9132d2",feeToken:"0xecac9c5f704e954931349da37f60e39f515c11c1"}//LBTC Base
]

const fetch: FetchV2 = async (option: FetchOptions) => {
  const dailyFees = option.createBalances()
  
  for (const vault of VAULTS) {
    const logs = await option.getLogs({
      target: vault.address,
      eventAbi: "event ManagementFeeCharged (uint256 feeAmount)",
    })
    logs.map((e: any) => {
      dailyFees.add(vault.feeToken,e.feeAmount)
    })
  }

  return {
    dailyFees: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-10-07',
    },
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2024-12-11',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: '2024-11-22',
    },
  },
  version: 2
}

export default adapter;
