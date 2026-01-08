import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from '../helpers/metrics';

const contract_open_term_loan_manager_stablecoin: string[] = [
  '0x2638802a78d6a97d0041cc7b52fb9a80994424cd',
  '0x483082e93635ef280bc5e9f65575a7ff288aba33',
  '0xdc9b93a8a336fe5dc9db97616ea2118000d70fc0',
  '0xfab269cb4ab4d33a61e1648114f6147742f5eecc',
  '0x9ab77dbd4197c532f9c9f30a7e83a710e03da70a',
  '0x616022e54324ef9c13b99c229dac8ea69af4faff',
  '0x6aceb4caba81fa6a8065059f3a944fb066a10fac',
  '0x56ef41693f69d422a88cc6492888a1bd41923d33',
  '0xb50d675f3c6d18ce5ccac691354f92afebd1675e'
]
const contract_open_term_loan_manager_eth = '0xe3aac29001c769fafcef0df072ca396e310ed13b';

const CLAIMED_FUNDS_DISTRIBUTED_EVENT = 'event ClaimedFundsDistributed(address indexed loan_, uint256 principal_, uint256 netInterest_, uint256 delegateManagementFee_, uint256 delegateServiceFee_, uint256 platformManagementFee_, uint256 platformServiceFee_)';

function getHoldersRevenueShare(date: number): number {
  if (date < 1761955200) { // 2025-11-01
    return 0 
  } else {
    return 0.25;
  }
}

const fetchFees = async (options: FetchOptions) => {
  const { getLogs } = options
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const holdersShare = getHoldersRevenueShare(options.startOfDay);
  
  const logs_claim_funds_stablecoin = await getLogs({
    targets: contract_open_term_loan_manager_stablecoin,
    eventAbi: CLAIMED_FUNDS_DISTRIBUTED_EVENT,
  })

  logs_claim_funds_stablecoin.map((e: any) => {
    dailyFees.add(ADDRESSES.ethereum.USDC, e.netInterest_, METRIC.BORROW_INTEREST)
    dailyFees.add(ADDRESSES.ethereum.USDC, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyFees.add(ADDRESSES.ethereum.USDC, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyFees.add(ADDRESSES.ethereum.USDC, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyFees.add(ADDRESSES.ethereum.USDC, e.platformServiceFee_, METRIC.SERVICE_FEES)

    dailySupplySideRevenue.add(ADDRESSES.ethereum.USDC, e.netInterest_, METRIC.BORROW_INTEREST)

    dailyRevenue.add(ADDRESSES.ethereum.USDC, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyRevenue.add(ADDRESSES.ethereum.USDC, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyRevenue.add(ADDRESSES.ethereum.USDC, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyRevenue.add(ADDRESSES.ethereum.USDC, e.platformServiceFee_, METRIC.SERVICE_FEES)

    dailyProtocolRevenue.add(ADDRESSES.ethereum.USDC, Number(e.delegateManagementFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)
    dailyProtocolRevenue.add(ADDRESSES.ethereum.USDC, Number(e.platformManagementFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)
    dailyProtocolRevenue.add(ADDRESSES.ethereum.USDC, Number(e.delegateServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)
    dailyProtocolRevenue.add(ADDRESSES.ethereum.USDC, Number(e.platformServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)

    dailyHoldersRevenue.add(ADDRESSES.ethereum.USDC, Number(e.delegateManagementFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(ADDRESSES.ethereum.USDC, Number(e.platformManagementFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(ADDRESSES.ethereum.USDC, Number(e.delegateServiceFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(ADDRESSES.ethereum.USDC, Number(e.platformServiceFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
  })

  const logs_claim_funds_eth = await getLogs({
    target: contract_open_term_loan_manager_eth,
    eventAbi: CLAIMED_FUNDS_DISTRIBUTED_EVENT,
  })

  logs_claim_funds_eth.map((e: any) => {
    dailyFees.add(ADDRESSES.ethereum.WETH, e.netInterest_, METRIC.BORROW_INTEREST)
    dailyFees.add(ADDRESSES.ethereum.WETH, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyFees.add(ADDRESSES.ethereum.WETH, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyFees.add(ADDRESSES.ethereum.WETH, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyFees.add(ADDRESSES.ethereum.WETH, e.platformServiceFee_, METRIC.SERVICE_FEES)

    dailySupplySideRevenue.add(ADDRESSES.ethereum.WETH, e.netInterest_, METRIC.BORROW_INTEREST)

    dailyRevenue.add(ADDRESSES.ethereum.WETH, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyRevenue.add(ADDRESSES.ethereum.WETH, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyRevenue.add(ADDRESSES.ethereum.WETH, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyRevenue.add(ADDRESSES.ethereum.WETH, e.platformServiceFee_, METRIC.SERVICE_FEES)

    dailyProtocolRevenue.add(ADDRESSES.ethereum.WETH, Number(e.delegateManagementFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)
    dailyProtocolRevenue.add(ADDRESSES.ethereum.WETH, Number(e.platformManagementFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)
    dailyProtocolRevenue.add(ADDRESSES.ethereum.WETH, Number(e.delegateServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)
    dailyProtocolRevenue.add(ADDRESSES.ethereum.WETH, Number(e.platformServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)

    dailyHoldersRevenue.add(ADDRESSES.ethereum.WETH, Number(e.delegateManagementFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(ADDRESSES.ethereum.WETH, Number(e.platformManagementFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(ADDRESSES.ethereum.WETH, Number(e.delegateServiceFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(ADDRESSES.ethereum.WETH, Number(e.platformServiceFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
  })
  
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue, 
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees as any,
      start: '2023-01-01',
    }
  },
  methodology: {
    Fees: "Total interest and fees paid by borrowers on loans, including net interest from loan distributions and open-term loan claims.",
    Revenue: "Total revenue flowing to Maple protocol treasuries, including fees from loan management, delegate fees, and platform fees collected from various pool strategies.",
    ProtocolRevenue: "Total revenue flowing to Maple protocol treasuries.",
    SupplySideRevenue: "Interest earned by liquidity providers/depositors in Maple pools from net interest distributions on loans.",
    HoldersRevenue: "Maple use 25% from protocol revenue to buy back SYRUP tokens from MIP-019.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Net borrow interests paid by borrowers.',
      [METRIC.MANAGEMENT_FEES]: 'Management fees cut by protocol and delegators.',
      [METRIC.SERVICE_FEES]: 'Service fees cut by protocol and delegators.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Net borrow interests are distributed to suppliers.',
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: 'Management fees cut by protocol and delegators.',
      [METRIC.SERVICE_FEES]: 'Service fees cut by protocol and delegators.',
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: 'Management fees share to Maple protocol.',
      [METRIC.SERVICE_FEES]: 'Service fees share to Maple protocol.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: 'From MIP-019, Maple use 25% from protocol revenue to buy back SYRUP tokens.',
    },
  }
}
export default adapters;
