import { ethers } from "ethers";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import coreAssets from "../helpers/coreAssets.json";

const usdt = coreAssets.ethereum.USDT
const stablecoins = [usdt , coreAssets.ethereum.USDC]

const mint_event =
  "event Mint( address indexed minter,address indexed benefactor,address indexed beneficiary,address collateral_asset,uint256 collateral_amount,uint256 usde_amount)";
const fetch = async (_t:number, _c:any, options: FetchOptions) => {
  const logs = await options.getLogs({
    eventAbi: mint_event,
    target: "0x2cc440b721d2cafd6d64908d6d8c4acc57f8afc3",
  });
  const in_flow = (await options.getLogs({
    targets: stablecoins,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, [
      ethers.zeroPadValue("0x71e4f98e8f20c88112489de3dded4489802a3a87", 32),
      ethers.zeroPadValue("0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5", 32),
    ]] as any,
  }))[0].filter((log:any[])=>!["0x71e4f98e8f20c88112489de3dded4489802a3a87", "0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5"]
    .some(a=>a.toLowerCase() === log[0].toLowerCase()))

  const out_flow = (await options.getLogs({
    targets: stablecoins,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, [
      ethers.zeroPadValue("0xf2fa332bd83149c66b09b45670bce64746c6b439", 32),
    ]] as any,
  }))[0]

  const extra_fees_to_distribute = (await options.getLogs({
    targets: stablecoins,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, [
      ethers.zeroPadValue("0xd0ec8cc7414f27ce85f8dece6b4a58225f273311", 32),
    ]] as any,
  }))[0]

  const dailyFeesInflow = options.createBalances();
  const supplyRewards = options.createBalances();

  in_flow.map((log: any) => {
    const amount = Number(log.value);
    dailyFeesInflow.add(usdt, amount);
  });
  out_flow.map((log: any) => {
    const amount = Number(log.value);
    supplyRewards.add(usdt, amount);
  });
  extra_fees_to_distribute.map((log: any) => {
    const amount = Number(log.value);
    dailyFeesInflow.add(usdt, amount);
    supplyRewards.add(usdt, amount);
  });
  const dailyFeesMint = options.createBalances();
  logs.map((log) => {
    dailyFeesMint.add(log.collateral_asset, log.collateral_amount);
  });

  dailyFeesMint.resizeBy(0.001);
  dailyFeesMint.addBalances(dailyFeesInflow);
  const revenue = dailyFeesMint.clone();
  revenue.subtract(supplyRewards);
  return {
    dailyFees: dailyFeesMint,
    dailyRevenue: revenue,
  };
};

const adapters = {
  // version v1 because if we track expenses but not income it leads to wrong data, need to include both
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2023-11-24',
    },
  },
};
export default adapters;
