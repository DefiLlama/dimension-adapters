import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

interface OpenEdenConfig {
  USDO: string;
  mintRedeemFeesWallets: Array<string>;
}

const configs: Record<string, OpenEdenConfig> = {
  [CHAIN.ETHEREUM]: {
    USDO: '0x8238884Ec9668Ef77B90C6dfF4D1a9F4F4823BFe',
    mintRedeemFeesWallets: ['0x5bcdd6b1FC9f8488503D86e9f73172eFDD69533F',]
  },
  [CHAIN.BASE]: {
    USDO: '0xad55aebc9b8c03fc43cd9f62260391c13c23e7c0',
    mintRedeemFeesWallets: ['0xEC005b31d329d17cAF2b72E30d2Aa95462bE956d'],
  }
}

// https://docs.openeden.com/tbill/fees#total-expense-ratio
const MANAGEMENT_FEES_RATE = 0.003; // 0.3% per year

const fetch = async (options: FetchOptions) => {
  const dailyMintRedeemFees = options.createBalances();
  
  // -- mint/redeeem fees
  await addTokensReceived({
    balances: dailyMintRedeemFees,
    options,
    targets: configs[options.chain].mintRedeemFeesWallets,
  })
  
  // remove received USDO
  dailyMintRedeemFees.removeTokenBalance(configs[options.chain].USDO)

  const dailyFees = dailyMintRedeemFees.clone(1, METRIC.MINT_REDEEM_FEES)
  const dailyUserFees = dailyMintRedeemFees.clone(1, METRIC.MINT_REDEEM_FEES)
  const dailyRevenue = dailyMintRedeemFees.clone(1, METRIC.MINT_REDEEM_FEES)

  // -- management fees per year
  const totalSupply = await options.api.call({
    abi: 'uint256:totalSupply',
    target: configs[options.chain].USDO,
  })

  const currentPeriod = options.toTimestamp - options.fromTimestamp
  const managementFees = Number(totalSupply) * MANAGEMENT_FEES_RATE * currentPeriod / (365 * 24 * 3600)

  dailyFees.add(configs[options.chain].USDO, managementFees, METRIC.MANAGEMENT_FEES)
  dailyRevenue.add(configs[options.chain].USDO, managementFees, METRIC.MANAGEMENT_FEES)

  // -- yields distributed to USDO holders via rebasing
  const rateBefore = await options.fromApi.call({
    abi: 'function convertToTokens(uint256) view returns (uint256)',
    target: configs[options.chain].USDO,
    params: ['1000000000000000000'],
  })
  const rateAfter = await options.toApi.call({
    abi: 'function convertToTokens(uint256) view returns (uint256)',
    target: configs[options.chain].USDO,
    params: ['1000000000000000000'],
  })
  const yieldCollected = Number(totalSupply) * (Number(rateAfter) - Number(rateBefore)) / 1e18

  const dailySupplySideRevenue = options.createBalances()
  dailyFees.add(configs[options.chain].USDO, yieldCollected, METRIC.ASSETS_YIELDS)
  dailySupplySideRevenue.add(configs[options.chain].USDO, yieldCollected, METRIC.ASSETS_YIELDS)

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const methodology = {
  Fees: 'All fees from users mint/redeem USDO, yields and management fees from backing assets.',
  UserFees: 'Users pay fees to minting/redeeming USDO.',
  Revenue: 'Mint/redeem USDO fees and 0.3% annual is charged by the Investment Manager.',
  ProtocolRevenue: 'Mint/redeem USDO fees and 0.3% annual is charged by the Investment Manager.',
  SupplySideRevenue: 'Backing assets yields collected and distributed to suppliers via USDO token rebasing.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'USDO backing assets yields from all investments.',
    [METRIC.MINT_REDEEM_FEES]: 'Fees from mint/redeem USDO.',
    [METRIC.MANAGEMENT_FEES]: '0.3% annual management fees.',
  },
  UserFees: {
    [METRIC.MINT_REDEEM_FEES]: 'Users pay fees when mint/redeem USDO.',
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: 'Fees from mint/redeem USDO.',
    [METRIC.MANAGEMENT_FEES]: '0.3% annual management fees.',
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]: 'Fees from mint/redeem USDO.',
    [METRIC.MANAGEMENT_FEES]: '0.3% annual management fees.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'USDO backing assets yields from all investments.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  fetch,
  chains: [CHAIN.BASE, CHAIN.ETHEREUM],
  start: '2025-01-18',
};

export default adapter;
