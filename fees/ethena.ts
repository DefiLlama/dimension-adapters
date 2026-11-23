import { ethers } from "ethers";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import coreAssets from "../helpers/coreAssets.json";

const usdt = coreAssets.ethereum.USDT
const usdc = coreAssets.ethereum.USDC
const usde = coreAssets.ethereum.USDe
const stablecoins = [usdt, usdc]

const MINT_AND_REDEEM_CONTRACT: Record<string, string> = {
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

const REDEEM_EVENT_ABI = {
  'V1': "event Redeem(address indexed redeemer,address indexed benefactor,address indexed beneficiary,address collateral_asset,uint256 collateral_amount,uint256 usde_amount)",
  'V2': "event Redeem(string indexed order_id, address indexed benefactor, address indexed beneficiary, address redeemer, address collateral_asset, uint256 collateral_amount, uint256 usde_amount)"
}

const EXTRA_METRICS = {
  MINT_FEES: 'Mint Fees',
  REDEEM_FEES: 'Redeem Fees',
  RESERVE_FUND: 'Reserve Fund',
  SUSDE_STAKING_REWARDS: 'sUSDe Staking Rewards',
  EXTRA_REWARDS: 'Extra Rewards',
  AAVE_LIQ_FEES: 'Aave Liquidation Fees',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = dailyFees.clone();
  const dailySupplySideRevenue = options.createBalances();

  const getLogsOfBothContracts = async (eventAbi: Record<string, string>) => {
    const [v1Logs, v2Logs] = await Promise.all(['V1', 'V2'].map((version) =>
      options.getLogs({ eventAbi: eventAbi[version], target: MINT_AND_REDEEM_CONTRACT[version] })));
    return [...v1Logs, ...v2Logs];
  };
  const mintLogs = await getLogsOfBothContracts(MINT_EVENT_ABI);
  const redeemLogs = await getLogsOfBothContracts(REDEEM_EVENT_ABI);

  const collateralAssets = [...new Set([...mintLogs, ...redeemLogs].map((log) => log.collateral_asset.toLowerCase()))];
  const collateralDecimals = await options.api.multiCall({ abi: 'uint8:decimals', calls: collateralAssets });
  const decimalsByAsset = Object.fromEntries(collateralAssets.map((asset, i) => [asset, Number(collateralDecimals[i])]));

  const usdeInCollateralUnits = (log: any) => {
    const decimals = decimalsByAsset[log.collateral_asset.toLowerCase()];
    const usdeAmount = BigInt(log.usde_amount);
    return decimals >= 18 ? usdeAmount * 10n ** BigInt(decimals - 18) : usdeAmount / 10n ** BigInt(18 - decimals);
  };

  // V1 mints against ETH collateral (WETH, stETH, wBETH, mETH; 2023-11..2024-04) have no unit-comparable fee and floor to zero
  const addUserFee = (log: any, fee: bigint, label: string) => {
    if (fee > 0n) dailyUserFees.add(log.collateral_asset.toLowerCase(), fee, label);
  };
  mintLogs.forEach((log) => addUserFee(log, BigInt(log.collateral_amount) - usdeInCollateralUnits(log), EXTRA_METRICS.MINT_FEES));
  redeemLogs.forEach((log) => addUserFee(log, usdeInCollateralUnits(log) - BigInt(log.collateral_amount), EXTRA_METRICS.REDEEM_FEES));

  dailyFees.addBalances(dailyUserFees);
  dailyRevenue.addBalances(dailyUserFees);

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
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyUserFees,
  }
}

const adapters = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  fetch,
  start: '2023-11-24',
  methodology: {
    Fees: "Staking rewards + yield distribution + mint fees + redeem fees + extra fees",
    UserFees: "Fees users pay when minting USDe with stablecoin collateral and when redeeming USDe for stablecoins. Mints against ETH collateral (2023-11 to 2024-04) are not counted.",
    Revenue: "Mint Fees, Redeem Fees and staking rewards portion to Reserve Fund",
    ProtocolRevenue: "Mint Fees, Redeem Fees and staking rewards portion to Reserve Fund",
    SupplySideRevenue: "Staking rewards, extra rewards and Aave liquidation fees distributed to sUSDe stakers",
  },
  breakdownMethodology: {
    Fees: {
      [EXTRA_METRICS.MINT_FEES]: 'Mint fee plus gas users pay when minting USDe with stablecoin collateral: the collateral deposited minus the USDe minted, kept by the protocol.',
      [EXTRA_METRICS.REDEEM_FEES]: 'Redemption fee plus gas users pay when redeeming USDe: the USDe burned minus the stablecoin collateral paid out, kept by the protocol.',
      [EXTRA_METRICS.RESERVE_FUND]: 'Staking rewards portion to Reserve Fund.',
      [EXTRA_METRICS.SUSDE_STAKING_REWARDS]: 'Staking rewards distributed to sUSDe stakers.',
      [EXTRA_METRICS.EXTRA_REWARDS]: 'Extra rewards distributed to sUSDe stakers.',
      [EXTRA_METRICS.AAVE_LIQ_FEES]: 'Aave liquidation fees distributed to sUSDe stakers.',
    },
    Revenue: {
      [EXTRA_METRICS.MINT_FEES]: 'Mint fee plus gas users pay when minting USDe with stablecoin collateral: the collateral deposited minus the USDe minted, kept by the protocol.',
      [EXTRA_METRICS.REDEEM_FEES]: 'Redemption fee plus gas users pay when redeeming USDe: the USDe burned minus the stablecoin collateral paid out, kept by the protocol.',
      [EXTRA_METRICS.RESERVE_FUND]: 'Staking rewards portion to Reserve Fund.',
    },
    ProtocolRevenue: {
      [EXTRA_METRICS.MINT_FEES]: 'Mint fee plus gas users pay when minting USDe with stablecoin collateral: the collateral deposited minus the USDe minted, kept by the protocol.',
      [EXTRA_METRICS.REDEEM_FEES]: 'Redemption fee plus gas users pay when redeeming USDe: the USDe burned minus the stablecoin collateral paid out, kept by the protocol.',
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
