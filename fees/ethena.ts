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
const ETHENA_EXTRA_REWARD_DISTRIBUTIONS = '0xd0ec8cc7414f27ce85f8dece6b4a58225f273311';
const ETHENA_AAVE_LIQ_FEES_DISTRIBUTIONS = '0xf19c433c6b288e487b767595886321f89a3cbf17';

const MINT_EVENT_ABI = {
  'V1': "event Mint(address indexed minter,address indexed benefactor,address indexed beneficiary,address collateral_asset,uint256 collateral_amount,uint256 usde_amount)",
  'V2': "event Mint(string indexed order_id, address indexed benefactor, address indexed beneficiary, address minter, address collateral_asset, uint256 collateral_amount, uint256 usde_amount)"
}

const EXTRA_METRICS = {
  MINT_FEES: 'Mint Fees',
  RESERVE_FUND: 'Reserve Fund',
  SUSDE_STAKING_REWARDS: 'sUSDe Staking Rewards',
  EXTRA_REWARDS: 'Extra Rewards',
  AAVE_LIQ_FEES: 'Aave Liquidation Fees',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyMintFees = options.createBalances();
  const dailyRevenue = dailyFees.clone();
  const dailySupplySideRevenue = options.createBalances();

  const v1_logs = await options.getLogs({
    eventAbi: MINT_EVENT_ABI['V1'],
    target: MINT_AND_REDEEM_CONTRACT['V1'],
  });
  const v2_logs = await options.getLogs({
    eventAbi: MINT_EVENT_ABI['V2'],
    target: MINT_AND_REDEEM_CONTRACT['V2'],
  });

  // Mint fees is approx 0.1% but we changed it to collateral_amount - usde_amount and ignore negative values
  v1_logs.map((log) => {
    const fee = Number(log.collateral_amount) - (Number(log.usde_amount) / 1e12);
    if (fee > 0) {
      dailyMintFees.add(log.collateral_asset.toLowerCase(), fee, EXTRA_METRICS.MINT_FEES);
    }
  });

  // Mint fees is approx 0.1%
  v2_logs.map((log) => {
    // 0.1% mint amount
    const fee = (Number(log.usde_amount) / 0.999) - Number(log.usde_amount)
    dailyMintFees.add(usde, fee, EXTRA_METRICS.MINT_FEES);
  });
  dailyFees.addBalances(dailyMintFees, EXTRA_METRICS.MINT_FEES);
  dailyRevenue.addBalances(dailyMintFees, EXTRA_METRICS.MINT_FEES);

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
    dailyFees.add(usdt, Number(log.value), EXTRA_METRICS.RESERVE_FUND);
    dailyRevenue.add(usdt, Number(log.value), EXTRA_METRICS.RESERVE_FUND);
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
    dailyFees.add(usdt, Number(log.value), EXTRA_METRICS.SUSDE_STAKING_REWARDS);
    dailySupplySideRevenue.add(usdt, Number(log.value), EXTRA_METRICS.SUSDE_STAKING_REWARDS);
  });

  const extra_fees_to_distribute = (await options.getLogs({
    targets: stablecoins,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      ethers.zeroPadValue(ETHENA_EXTRA_REWARD_DISTRIBUTIONS, 32),
    ],
  })).flat()
  extra_fees_to_distribute.map((log: any) => {
    dailyFees.add(usdt, Number(log.value), EXTRA_METRICS.EXTRA_REWARDS);
    dailySupplySideRevenue.add(usdt, Number(log.value), EXTRA_METRICS.EXTRA_REWARDS);
  });

  const aave_liquid_fees_to_distribute = (await options.getLogs({
    target: usde,
    flatten: false,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      ethers.zeroPadValue(ETHENA_AAVE_LIQ_FEES_DISTRIBUTIONS, 32),
    ],
  })).flat()
  aave_liquid_fees_to_distribute.map((log: any) => {
    dailyFees.add(usde, Number(log.value), EXTRA_METRICS.AAVE_LIQ_FEES);
    dailySupplySideRevenue.add(usde, Number(log.value), EXTRA_METRICS.AAVE_LIQ_FEES);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyUserFees: dailyMintFees,
  }
}

const adapters = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-11-24',
    },
  },
  methodology: {
    Fees: "Staking rewards + yield distribution + mint fees + extra fees",
    UserFees: "User pay fees when mint USDe using USDT, USDC or USDtb",
    Revenue: "Mint Fees and staking rewards portion to Reserve Fund",
    SupplySideRevenue: "Mint Fees and staking rewards distributed to suppliers",
  },
  breakdownMethodology: {
    Fees: {
      [EXTRA_METRICS.MINT_FEES]: 'User pay fees when mint USDe using USDT, USDC or USDtb.',
      [EXTRA_METRICS.RESERVE_FUND]: 'Staking rewards portion to Reserve Fund.',
      [EXTRA_METRICS.SUSDE_STAKING_REWARDS]: 'Staking rewards distributed to sUSDe stakers.',
      [EXTRA_METRICS.EXTRA_REWARDS]: 'Extra rewards distributed to sUSDe stakers.',
      [EXTRA_METRICS.AAVE_LIQ_FEES]: 'Aave liquidation fees distributed to sUSDe stakers.',
    },
    Revenue: {
      [EXTRA_METRICS.MINT_FEES]: 'User pay fees when mint USDe using USDT, USDC or USDtb.',
      [EXTRA_METRICS.RESERVE_FUND]: 'Staking rewards portion to Reserve Fund.',
    },
    SupplySideRevenue: {
      [EXTRA_METRICS.SUSDE_STAKING_REWARDS]: 'Staking rewards distributed to sUSDe stakers.',
      [EXTRA_METRICS.EXTRA_REWARDS]: 'Extra rewards distributed to sUSDe stakers.',
      [EXTRA_METRICS.AAVE_LIQ_FEES]: 'Aave liquidation fees distributed to sUSDe stakers.',
    },
  },
};
export default adapters;
