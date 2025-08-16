import { ethers } from "ethers";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import coreAssets from "../helpers/coreAssets.json";

const usdt = coreAssets.ethereum.USDT
const usdc = coreAssets.ethereum.USDC
const usde = coreAssets.ethereum.USDe
const stablecoins = [usdt, usdc]

const MINT_AND_REDEEM_CONTRACT = {
  'V1': '0x2CC440b721d2CaFd6D64908D6d8C4aCC57F8Afc3',
  'V2': '0xe3490297a08d6fC8Da46Edb7B6142E4F461b62D3'
}

const ETHENA_sUSDe_YIELD_DISTRIBUTIONS = '0x71E4f98e8f20C88112489de3DDEd4489802a3A87';
const ETHENA_RESERVE_FUND = '0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5';
const ETHENA_USDe_TO_sUSDe_STAKING_REWARD_DISTRIBUTIONS = '0xf2fa332bD83149c66b09B45670bCe64746C6b439';

const MINT_EVENT_ABI = {
  'V1': "event Mint(address indexed minter,address indexed benefactor,address indexed beneficiary,address collateral_asset,uint256 collateral_amount,uint256 usde_amount)",
  'V2': "event Mint(string indexed order_id, address indexed benefactor, address indexed beneficiary, address minter, address collateral_asset, uint256 collateral_amount, uint256 usde_amount)"
}

const fetch = async (_t: number, _c: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyMintFees = options.createBalances();
  const dailySupplyRevenue = options.createBalances();

  const v1_logs = await options.getLogs({
    eventAbi: MINT_EVENT_ABI['V1'],
    target: MINT_AND_REDEEM_CONTRACT['V1'],
  });
  const v2_logs = await options.getLogs({
    eventAbi: MINT_EVENT_ABI['V2'],
    target: MINT_AND_REDEEM_CONTRACT['V2'],
  });

  v1_logs.map((log) => {
    const fee = Number(log.collateral_amount) - (Number(log.usde_amount) / 1e12);
    if (fee > 0) {
      dailyMintFees.add(log.collateral_asset.toLowerCase(), fee);
    }
  });
  v2_logs.map((log) => {
    const fee = Number(log.collateral_amount) - (Number(log.usde_amount) / 1e12);
    if (fee > 0) {
      dailyMintFees.add(log.collateral_asset.toLowerCase(), fee);
    }
  });
  dailyFees.addBalances(dailyMintFees);

  // Mint fees is approx 0.1% but we changed it to collateral_amount - usde_amount and ignore negative values
  // dailyFeesMint.resizeBy(0.001);

  // https://etherscan.io/advanced-filter?fadd=0x71E4f98e8f20C88112489de3DDEd4489802a3A87&tadd=0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5&qt=1&tkn=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48,0xdac17f958d2ee523a2206206994597c13d831ec7
  const in_flow = (await options.getLogs({
    targets: stablecoins,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      ethers.zeroPadValue(ETHENA_sUSDe_YIELD_DISTRIBUTIONS, 32),
      ethers.zeroPadValue(ETHENA_RESERVE_FUND, 32),
    ],
  })).flat()

  in_flow.map((log: any) => {
    dailyFees.add(usdt, Number(log.value));
  });

  // https://etherscan.io/advanced-filter?qt=1&tkn=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48%2c0xdac17f958d2ee523a2206206994597c13d831ec7&fadd=0xf2fa332bd83149c66b09b45670bce64746c6b439
  const out_flow = (await options.getLogs({
    targets: stablecoins,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      ethers.zeroPadValue(ETHENA_USDe_TO_sUSDe_STAKING_REWARD_DISTRIBUTIONS, 32),
    ],
  })).flat()

  out_flow.map((log: any) => {
    dailyFees.add(usdt, Number(log.value));
    dailySupplyRevenue.add(usdt, Number(log.value));
  });

  const extra_fees_to_distribute = (await options.getLogs({
    targets: stablecoins,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      ethers.zeroPadValue("0xd0ec8cc7414f27ce85f8dece6b4a58225f273311", 32),
    ],
  })).flat()
  extra_fees_to_distribute.map((log: any) => {
    dailyFees.add(usdt, Number(log.value));
    dailySupplyRevenue.add(usdt, Number(log.value));
  });

  const aave_liquid_fees_to_distribute = (await options.getLogs({
    target: usde,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      ethers.zeroPadValue("0xf19c433c6b288e487b767595886321f89a3cbf17", 32),
    ],
  })).flat()
  aave_liquid_fees_to_distribute.map((log: any) => {
    dailyFees.add(usde, Number(log.value));
    dailySupplyRevenue.add(usde, Number(log.value));
  });

  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyUserFees: dailyMintFees,
  }
}

const adapters = {
  // version v1 because if we track expenses but not income it leads to wrong data, need to include both
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2023-11-24',
    },
  },
  methodology: {
    Fees: "Staking rewards + yield distribution + mint fees + extra fees",
    Revenue: "Mint Fees and staking rewards portion to Reserve Fund",
    UserFees: "Mint Fees",
  }
};
export default adapters;
