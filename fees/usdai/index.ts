import { CHAIN } from "../../helpers/chains";

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { processPoolLoans, getLegacyPools } from "./legacyUtils";
import { request, gql } from "graphql-request";

// Loan Router Subgraph API
const LOAN_ROUTER_SUBGRAPH_API = 'https://api.goldsky.com/api/public/project_clzibgddg2epg01ze4lq55scx/subgraphs/loan_router_arbitrum/0.0.3/gn';

// Wrapped M
const WRAPPED_M = '0x437cc33344a0B27A429f795ff6B469C72698B291';
const CLAIMED_EVENT_ABI = 'event Claimed(address indexed account, address indexed recipient, uint240 yield)';

// PYUSD
const PYUSD = '0x46850aD61C2B7d64d08c9C754F45254596696984';

// USDai
const USDAI = '0x0A1a1A107E45b7Ced86833863f482BC5f4ed82EF';
const HARVEST_EVENT_ABI = 'event Harvested(uint256 usdaiAmount)';

// Staked USDai
const SUSDAI = '0x0B2b2B2076d95dda7817e785989fE353fe955ef9';

// Loan Router
const LOAN_ROUTER = '0x0C2ED170F2bB1DF1a44292Ad621B577b3C9597D1';
const LOAN_ORIGINATED_EVENT_ABI = 'event LoanOriginated(bytes32 indexed loanTermsHash, address indexed borrower, address indexed currencyToken, uint256 principal, uint256 originationFee)';
const LENDER_REPAID_EVENT_ABI = 'event LenderRepaid(bytes32 indexed loanTermsHash,address indexed lender,uint8 indexed trancheIndex,uint256 principal,uint256 interest,uint256 prepay)';
const LOAN_REPAID_EVENT_ABI = 'event LoanRepaid(bytes32 indexed loanTermsHash, address indexed borrower, uint256 principal, uint256 interest, uint256 prepayment, uint256 exitFee, bool isRepaid)';
const LOAN_COLLATERAL_LIQUIDATION_EVENT_ABI = 'event LoanCollateralLiquidated(bytes32 indexed loanTermsHash, uint256 proceeds, uint256 liquidationFee, uint256 surplus)';
const LENDER_LIQUIDATION_REPAID_EVENT_ABI = 'event LenderLiquidationRepaid(bytes32 indexed loanTermsHash,address indexed lender,uint8 indexed trancheIndex,uint256 principal,uint256 interest)';
const loanOriginatedByHashQuery = gql`
  query GetLoanOriginationByHash($loanTermsHash: Bytes!) {
    loanOriginateds(where: { loanTermsHash: $loanTermsHash }, first: 1) {
      currencyToken {
        id
      }
    }
  }
`;

// 10,000 basis points = 100%, 10% of interest going to protocol
const BASIS_POINTS_SCALE = 10_000n;
const BASE_YIELD_ADMIN_FEE_RATE = 1_000n;
const GPU_YIELD_ADMIN_FEE_RATE = 1_000n;

// Methodology
const methodology = {
  Fees: "Total interest and admin fees collected from USDai's base token yield and GPU-financing yield",
  Revenue: "Admin fees going to protocol treasury",
  ProtocolRevenue: "Admin fees going to protocol treasury",
  SupplySideRevenue: "Interest paid to Staked USDai holders"
};

// Fetch function
const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Base yield from wrapped M (base token)
  const wrappedMBaseYieldLogs = await options.getLogs({
    target: WRAPPED_M,
    eventAbi: CLAIMED_EVENT_ABI
  });
  wrappedMBaseYieldLogs.filter((log: any) => log.recipient === SUSDAI).forEach((log: any) => {
    dailyFees.add(WRAPPED_M, log.yield);
    dailyRevenue.add(WRAPPED_M, log.yield * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE);
    dailySupplySideRevenue.add(WRAPPED_M, log.yield * (BASIS_POINTS_SCALE - BASE_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE);
  });

  // Base yield from PYUSD (base token)
  const pyusdBaseYieldLogs = await options.getLogs({
    target: USDAI,
    eventAbi: HARVEST_EVENT_ABI
  });
  pyusdBaseYieldLogs.forEach((log: any) => {
    // Unscale USDai amount from 18 decimals to 6 decimals for PYUSD
    const amount = BigInt(log.usdaiAmount) / BigInt(10 ** 12);

    dailyFees.add(PYUSD, amount);
    dailyRevenue.add(PYUSD, amount * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE);
    dailySupplySideRevenue.add(PYUSD, amount * (BASIS_POINTS_SCALE - BASE_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE);
  });

  // Legacy pools for GPU-financing
  const pools = getLegacyPools();
  await Promise.all(
    pools.map(pool => processPoolLoans(pool, dailyFees, dailyRevenue, dailySupplySideRevenue, options))
  );

  // GPU-financing repayment yield from loan router
  const gpuLenderRepaidLogs = await options.getLogs({
    target: LOAN_ROUTER,
    eventAbi: LENDER_REPAID_EVENT_ABI
  });
  for (const log of gpuLenderRepaidLogs) {
    // Get loan origination entity using loan terms hash to get currency token
    const response = await request(LOAN_ROUTER_SUBGRAPH_API, loanOriginatedByHashQuery, {
      loanTermsHash: log.loanTermsHash
    });
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.interest)
    dailyRevenue.add(response.loanOriginateds[0].currencyToken.id, log.interest * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE);
    dailySupplySideRevenue.add(response.loanOriginateds[0].currencyToken.id, log.interest * (BASIS_POINTS_SCALE - GPU_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE);
  }

  // GPU-financing origination fee
  const gpuOriginationFeeLogs = await options.getLogs({
    target: LOAN_ROUTER,
    eventAbi: LOAN_ORIGINATED_EVENT_ABI
  });
  for (const log of gpuOriginationFeeLogs) {
    // Get loan origination entity using loan terms hash to get currency token
    const response = await request(LOAN_ROUTER_SUBGRAPH_API, loanOriginatedByHashQuery, {
      loanTermsHash: log.loanTermsHash
    });
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.originationFee);
    dailyRevenue.add(response.loanOriginateds[0].currencyToken.id, log.originationFee);
  }

  // GPU-financing exit fee
  const gpuExitFeeLogs = await options.getLogs({
    target: LOAN_ROUTER,
    eventAbi: LOAN_REPAID_EVENT_ABI
  });
  for (const log of gpuExitFeeLogs) {
    // Get loan origination entity using loan terms hash to get currency token
    const response = await request(LOAN_ROUTER_SUBGRAPH_API, loanOriginatedByHashQuery, {
      loanTermsHash: log.loanTermsHash
    });
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.exitFee);
    dailyRevenue.add(response.loanOriginateds[0].currencyToken.id, log.exitFee);
  }

  // GPU-financing liquidation fee
  const gpuLiquidationFeeLogs = await options.getLogs({
    target: LOAN_ROUTER,
    eventAbi: LOAN_COLLATERAL_LIQUIDATION_EVENT_ABI
  });
  for (const log of gpuLiquidationFeeLogs) {
    // Get loan origination entity using loan terms hash to get currency token
    const response = await request(LOAN_ROUTER_SUBGRAPH_API, loanOriginatedByHashQuery, {
      loanTermsHash: log.loanTermsHash
    });
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.liquidationFee + log.surplus);
    dailyRevenue.add(response.loanOriginateds[0].currencyToken.id, log.liquidationFee + log.surplus);
  }

  // GPU-financing lender liquidation repaid
  const gpuLenderLiquidationRepaidLogs = await options.getLogs({
    target: LOAN_ROUTER,
    eventAbi: LENDER_LIQUIDATION_REPAID_EVENT_ABI
  });
  for (const log of gpuLenderLiquidationRepaidLogs) {
    // Get loan origination entity using loan terms hash to get currency token
    const response = await request(LOAN_ROUTER_SUBGRAPH_API, loanOriginatedByHashQuery, {
      loanTermsHash: log.loanTermsHash
    });
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.interest);
    dailySupplySideRevenue.add(response.loanOriginateds[0].currencyToken.id, log.interest);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

// Adapter
const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-05-13',
    }
  },
};

export default adapter;