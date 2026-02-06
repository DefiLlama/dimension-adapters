import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from '../helpers/metrics';

const feeManager = '0xFeACa6A5703E6F9DE0ebE0975C93AE34c00523F2'

// Open-Term Loan
const openTermLoanManagerFactory = '0x90b14505221a24039A2D11Ad5862339db97Cc160'

const claimed_funds_distributed_event = 'event ClaimedFundsDistributed(address indexed loan_, uint256 principal_, uint256 netInterest_, uint256 delegateManagementFee_, uint256 delegateServiceFee_, uint256 platformManagementFee_, uint256 platformServiceFee_)';
const loan_manager_deployed_event = 'event InstanceDeployed(uint256 indexed version_, address indexed instance_, bytes initializationArguments_)'

// Fixed-Term Loan
// const fixedTermLoanManagerFactory = '0x1551717AE4FdCB65ed028F7fB7abA39908f6A7A6'
const fixedTermLoanFactoryV1 = '0x36a7350309B2Eb30F3B908aB0154851B5ED81db0'
const fixedTermLoanFactoryV2 = '0xeA067DB5B32CE036Ee5D8607DBB02f544768dBC6'

const origination_fees_paid_event = 'event OriginationFeesPaid(address loan_, uint256 delegateOriginationFee_, uint256 platformOriginationFee_)';
const service_fees_paid_event = 'event ServiceFeesPaid(address loan_, uint256 delegateServiceFee_, uint256 partialRefinanceDelegateServiceFee_, uint256 platformServiceFee_, uint256 partialRefinancePlatformServiceFee_)'
// const management_fees_paid_event = 'event ManagementFeesPaid(address loan_, uint256 delegateManagementFee_, uint256 platformManagementFee_)';

function getHoldersRevenueShare(date: number): number {
  if (date < 1761955200) { // 2025-11-01
    return 0 
  } else {
    return 0.25;
  }
}

const fetch = async (options: FetchOptions) => {
  const { getLogs } = options
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const holdersShare = getHoldersRevenueShare(options.startOfDay);

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);

  // Fixed Term Loan
  const logs_fixed_term_loan_deployed = await getLogs({
    targets: [fixedTermLoanFactoryV1, fixedTermLoanFactoryV2],
    eventAbi: loan_manager_deployed_event,
    fromBlock: 13997864 // Jan-13-2022
  })

  const fixed_term_loans: string[] = logs_fixed_term_loan_deployed.map(e => e.instance_);

  // const fixed_term_loan_managers = logs_fixed_term_loan_manager_deployed.map(e => e.instance_);

  const fixed_term_loan_assets = await options.api.multiCall({ abi: 'address:fundsAsset', calls: fixed_term_loans})

  const fixed_term_loan_to_asset: Record<string, string> = {};
  fixed_term_loans.forEach((loan, i) => {
    fixed_term_loan_to_asset[loan.toLowerCase()] = fixed_term_loan_assets[i];
  })

  // Origination fees from fixed-term loans
  const logs_origination_fees = await getLogs({
    target: feeManager,
    eventAbi: origination_fees_paid_event,
  })

  // Service fees from fixed-term loans  
  const logs_service_fees = await getLogs({
    target: feeManager,
    eventAbi: service_fees_paid_event,
  })

  logs_origination_fees.map((e: any) => {
    const asset = fixed_term_loan_to_asset[e.loan_?.toLowerCase()]
    dailyFees.add(asset, e.delegateOriginationFee_, METRIC.MANAGEMENT_FEES)
    dailyFees.add(asset, e.platformOriginationFee_, METRIC.MANAGEMENT_FEES)

    dailyRevenue.add(asset, e.delegateOriginationFee_, METRIC.MANAGEMENT_FEES)
    dailyRevenue.add(asset, e.platformOriginationFee_, METRIC.MANAGEMENT_FEES)

    dailyProtocolRevenue.add(asset, Number(e.delegateOriginationFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)
    dailyProtocolRevenue.add(asset, Number(e.platformOriginationFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)

    dailyHoldersRevenue.add(asset, Number(e.delegateOriginationFee_) * holdersShare, METRIC.MANAGEMENT_FEES)
    dailyHoldersRevenue.add(asset, Number(e.platformOriginationFee_) * holdersShare, METRIC.MANAGEMENT_FEES)

  })

  logs_service_fees.map((e: any) => {
    const asset = fixed_term_loan_to_asset[e.loan_?.toLowerCase()]
    dailyFees.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyFees.add(asset, e.partialRefinanceDelegateServiceFee_, METRIC.SERVICE_FEES)
    dailyFees.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)
    dailyFees.add(asset, e.partialRefinancePlatformServiceFee_, METRIC.SERVICE_FEES)

    dailyRevenue.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyRevenue.add(asset, e.partialRefinanceDelegateServiceFee_, METRIC.SERVICE_FEES)
    dailyRevenue.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)
    dailyRevenue.add(asset, e.partialRefinancePlatformServiceFee_, METRIC.SERVICE_FEES)

    dailyProtocolRevenue.add(asset, Number(e.delegateServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)
    dailyProtocolRevenue.add(asset, Number(e.partialRefinanceDelegateServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)
    dailyProtocolRevenue.add(asset, Number(e.platformServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)
    dailyProtocolRevenue.add(asset, Number(e.partialRefinancePlatformServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)

    dailyHoldersRevenue.add(asset, Number(e.delegateServiceFee_) * holdersShare, METRIC.SERVICE_FEES)
    dailyHoldersRevenue.add(asset, Number(e.partialRefinanceDelegateServiceFee_) * holdersShare, METRIC.SERVICE_FEES)
    dailyHoldersRevenue.add(asset, Number(e.platformServiceFee_) * holdersShare, METRIC.SERVICE_FEES)
    dailyHoldersRevenue.add(asset, Number(e.partialRefinancePlatformServiceFee_) * holdersShare, METRIC.SERVICE_FEES)
  })

  if (toBlock < 17372608) {
    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue, 
    }
  }

  const logs_open_term_loan_manager_deployed = await getLogs({
    target: openTermLoanManagerFactory,
    eventAbi: loan_manager_deployed_event,
    fromBlock: 17372608 // May-30-2023
  })

  // const open_term_loans = logs_open_term_loan_deployed.map(e => e.instance_);
  const open_term_loan_managers = logs_open_term_loan_manager_deployed.map(e => e.instance_);

  const loans = [...open_term_loan_managers];

  const assets = await options.api.multiCall({ abi: 'address:fundsAsset', calls: loans})

  const loanToAsset: Record<string, string> = {};
  loans.forEach((loan, i) => {
    loanToAsset[loan.toLowerCase()] = assets[i];
  })

  const logs_claim_funds_stablecoin = await getLogs({
    targets: loans,
    eventAbi: claimed_funds_distributed_event,
    entireLog: true,
    parseLog: true,
  })

  logs_claim_funds_stablecoin.map((t: any) => {
    const e = t.args;
    const asset = loanToAsset[t.address?.toLowerCase()];
    dailyFees.add(asset, e.netInterest_, METRIC.BORROW_INTEREST)
    dailyFees.add(asset, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyFees.add(asset, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyFees.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyFees.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)

    dailySupplySideRevenue.add(asset, e.netInterest_, METRIC.BORROW_INTEREST)

    dailyRevenue.add(asset, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyRevenue.add(asset, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
    dailyRevenue.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
    dailyRevenue.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)

    dailyProtocolRevenue.add(asset, Number(e.delegateManagementFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)
    dailyProtocolRevenue.add(asset, Number(e.platformManagementFee_) * (1 - holdersShare), METRIC.MANAGEMENT_FEES)
    dailyProtocolRevenue.add(asset, Number(e.delegateServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)
    dailyProtocolRevenue.add(asset, Number(e.platformServiceFee_) * (1 - holdersShare), METRIC.SERVICE_FEES)

    dailyHoldersRevenue.add(asset, Number(e.delegateManagementFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(asset, Number(e.platformManagementFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(asset, Number(e.delegateServiceFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.add(asset, Number(e.platformServiceFee_) * holdersShare, METRIC.TOKEN_BUY_BACK)
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
  fetch,
  start: '2022-01-01',
  chains: [CHAIN.ETHEREUM],
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
