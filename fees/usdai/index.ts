import { CHAIN } from "../../helpers/chains";

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { processPoolLoans, getLegacyPools } from "./legacyUtils";
import { request, gql } from "graphql-request";
import { METRICS } from "./metrics";

// Loan Router Subgraph API
const LOAN_ROUTER_SUBGRAPH_API = 'https://api.goldsky.com/api/public/project_clzibgddg2epg01ze4lq55scx/subgraphs/loan_router_arbitrum/0.0.3/gn';
// Goldsky subgraph indexing the v2 loan router on Arbitrum, used to look up the currency token per loan terms hash
const LOAN_ROUTER_V2_SUBGRAPH_API = 'https://api.goldsky.com/api/public/project_cmgziqwja00105np2g1gy6stc/subgraphs/loan_router_v2_arbitrum/latest/gn';

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
// v2 loan router contract: https://arbiscan.io/address/0x1C2ED170de32846316784c4fd58A5e3C7563E12f
const LOAN_ROUTER_V2 = '0x1C2ED170de32846316784c4fd58A5e3C7563E12f';
const LOAN_ORIGINATED_EVENT_ABI = 'event LoanOriginated(bytes32 indexed loanTermsHash, address indexed borrower, address indexed currencyToken, uint256 principal, uint256 originationFee)';
const LENDER_REPAID_EVENT_ABI = 'event LenderRepaid(bytes32 indexed loanTermsHash,address indexed lender,uint8 indexed trancheIndex,uint256 principal,uint256 interest,uint256 prepay)';
const LOAN_REPAID_EVENT_ABI = 'event LoanRepaid(bytes32 indexed loanTermsHash, address indexed borrower, uint256 principal, uint256 interest, uint256 prepayment, uint256 exitFee, bool isRepaid)';

// Loan router v2 emits all fees through a generic FeePaid event (kind: 0 origination, 1 repayment, 2 exit, 3 liquidation)
const FEE_PAID_EVENT_ABI = 'event FeePaid(bytes32 indexed loanTermsHash, uint8 indexed kind, address indexed recipient, address feeModel, uint256 amount)';
// FeePaid kind enum on the v2 loan router: 0 origination, 1 repayment, 2 exit, 3 liquidation
const FEE_KIND_ORIGINATION = 0;
const FEE_KIND_EXIT = 2;

// Loan router v2 liquidation events (fee and surplus both go to the protocol fee recipient)
const LIQUIDATION_PROCEEDS_DEPOSITED_EVENT_ABI = 'event LiquidationProceedsDeposited(bytes32 indexed loanTermsHash, uint256 proceeds, uint256 fee, uint256 surplus)';
const LENDER_LIQUIDATION_REPAID_EVENT_ABI = 'event LenderLiquidationRepaid(bytes32 indexed loanTermsHash, address indexed lender, uint8 indexed trancheIndex, uint256 principal, uint256 interest)';

// Two origination fees on loan router v2 were hijacked to record escrow interest payments. The full
// amount went to staked USDai, and the 10% admin fee taken offchain is recorded as amount / 9.
// Each hash is the loanTermsHash topic on the corresponding FeePaid event from LOAN_ROUTER_V2 above.
const ESCROW_INTEREST_LOAN_TERMS_HASHES = new Set([
  '0x5d9a1e60b5ecd05b66bc7230b754cb4a10222bc7c52840e98a1ed79ff01743a3',
  '0x1f5efd88cbd039733075ba273f22ccdde03130c6dcb72114d2738a17cd0bdafd',
]);

// Escrow Timelock (deposit token is USDai): https://arbiscan.io/address/0x1E710CC0b64E1D7572d35E43AD261587789B6438
const ESCROW_TIMELOCK = '0x1E710CC0b64E1D7572d35E43AD261587789B6438';
const ESCROW_WITHDRAWN_EVENT_ABI = 'event Withdrawn(address indexed withdrawer, bytes32 indexed context, uint256 depositAmount, uint256 withdrawAmount, uint256 interest)';
const ESCROW_CANCELED_EVENT_ABI = 'event Canceled(address indexed target, bytes32 indexed context, uint256 amount, uint256 interest)';

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
// 10% of escrow timelock interest goes to the protocol, matching the base and GPU yield admin rates
const ESCROW_YIELD_ADMIN_FEE_RATE = 1_000n;

// Methodology
const methodology = {
  Fees: "Total interest and admin fees collected from USDai's base token yield, GPU-financing yield, and escrow timelock yield",
  Revenue: "Admin fees going to protocol treasury",
  ProtocolRevenue: "Admin fees going to protocol treasury",
  SupplySideRevenue: "Interest paid to Staked USDai holders"
};

const breakdownMethodology = {
  Fees: {
    [METRICS.ASSET_YIELDS_WRAPPED_M]: 'Asset yields from wrapped M (Tbill backed yields)',
    [METRICS.ASSET_YIELDS_PYUSD]: 'Asset yields from PYUSD',
    [METRICS.ASSET_YIELDS_GPU_FINANCING]: 'Asset yields generated from GPU-financing',
    [METRICS.GPU_FINANCING_ORIGINATION_FEE]: 'GPU-financing origination fee',
    [METRICS.GPU_FINANCING_EXIT_FEE]: 'GPU-financing exit fee',
    [METRICS.GPU_FINANCING_LIQUIDATION_FEE]: 'GPU-financing liquidation fee',
    [METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID]: 'GPU-financing lender liquidation repaid',
    [METRICS.ESCROW_TIMELOCK_YIELDS]: 'Escrow timelock yields',
  },
  Revenue: {
    [METRICS.ASSET_YIELDS_WRAPPED_M_TO_PROTOCOL]: 'Asset yields from wrapped M to protocol',
    [METRICS.ASSET_YIELDS_PYUSD_TO_PROTOCOL]: 'Asset yields from PYUSD to protocol',
    [METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL]: 'Asset yields from GPU-financing to protocol',
    [METRICS.GPU_FINANCING_ORIGINATION_FEE_TO_PROTOCOL]: 'GPU-financing origination fee to protocol',
    [METRICS.GPU_FINANCING_EXIT_FEE_TO_PROTOCOL]: 'GPU-financing exit fee to protocol',
    [METRICS.GPU_FINANCING_LIQUIDATION_FEE_TO_PROTOCOL]: 'GPU-financing liquidation fee to protocol',
    [METRICS.ESCROW_TIMELOCK_YIELDS_TO_PROTOCOL]: 'Escrow timelock yields to protocol',
  },
  ProtocolRevenue: {
    [METRICS.ASSET_YIELDS_WRAPPED_M_TO_PROTOCOL]: 'Asset yields from wrapped M to protocol',
    [METRICS.ASSET_YIELDS_PYUSD_TO_PROTOCOL]: 'Asset yields from PYUSD to protocol',
    [METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL]: 'Asset yields from GPU-financing to protocol',
    [METRICS.GPU_FINANCING_ORIGINATION_FEE_TO_PROTOCOL]: 'GPU-financing origination fee to protocol',
    [METRICS.GPU_FINANCING_EXIT_FEE_TO_PROTOCOL]: 'GPU-financing exit fee to protocol',
    [METRICS.GPU_FINANCING_LIQUIDATION_FEE_TO_PROTOCOL]: 'GPU-financing liquidation fee to protocol',
    [METRICS.ESCROW_TIMELOCK_YIELDS_TO_PROTOCOL]: 'Escrow timelock yields to protocol',
  },
  SupplySideRevenue: {
    [METRICS.ASSET_YIELDS_WRAPPED_M_TO_SUSDAI]: 'Asset yields from wrapped M to staked USDai',
    [METRICS.ASSET_YIELDS_PYUSD_TO_SUSDAI]: 'Asset yields from PYUSD to staked USDai',
    [METRICS.ASSET_YIELDS_GPU_FINANCING_TO_SUSDAI]: 'Asset yields from GPU-financing to staked USDai',
    [METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID_TO_SUSDAI]: 'GPU-financing lender liquidation repaid to staked USDai',
    [METRICS.ESCROW_TIMELOCK_YIELDS_TO_SUSDAI]: 'Escrow timelock yields to staked USDai',
  },
}

// Fetch function
const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Look up the currency token for a v2 loan, caching by loan terms hash so repeated lookups across
  // the repayment, fee, and liquidation loops hit the subgraph only once per loan.
  const v2CurrencyTokenCache = new Map<string, Promise<string>>();
  const getV2CurrencyToken = (loanTermsHash: string): Promise<string> => {
    let cached = v2CurrencyTokenCache.get(loanTermsHash);
    if (!cached) {
      cached = request(LOAN_ROUTER_V2_SUBGRAPH_API, loanOriginatedByHashQuery, { loanTermsHash })
        .then((response: any) => {
          if (!response.loanOriginateds?.length) {
            throw new Error(`No v2 loan origination found for loan terms hash ${loanTermsHash}`);
          }
          return response.loanOriginateds[0].currencyToken.id;
        });
      v2CurrencyTokenCache.set(loanTermsHash, cached);
    }
    return cached;
  };

  // Base yield from wrapped M (base token)
  const wrappedMBaseYieldLogs = await options.getLogs({
    target: WRAPPED_M,
    eventAbi: CLAIMED_EVENT_ABI
  });
  wrappedMBaseYieldLogs.filter((log: any) => log.recipient === SUSDAI).forEach((log: any) => {
    dailyFees.add(WRAPPED_M, log.yield, METRICS.ASSET_YIELDS_WRAPPED_M);
    dailyRevenue.add(WRAPPED_M, log.yield * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_WRAPPED_M_TO_PROTOCOL);
    dailySupplySideRevenue.add(WRAPPED_M, log.yield * (BASIS_POINTS_SCALE - BASE_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_WRAPPED_M_TO_SUSDAI);
  });

  // Base yield from PYUSD (base token)
  const pyusdBaseYieldLogs = await options.getLogs({
    target: USDAI,
    eventAbi: HARVEST_EVENT_ABI
  });
  pyusdBaseYieldLogs.forEach((log: any) => {
    // Unscale USDai amount from 18 decimals to 6 decimals for PYUSD
    const amount = BigInt(log.usdaiAmount) / BigInt(10 ** 12);

    dailyFees.add(PYUSD, amount, METRICS.ASSET_YIELDS_PYUSD);
    dailyRevenue.add(PYUSD, amount * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_PYUSD_TO_PROTOCOL);
    dailySupplySideRevenue.add(PYUSD, amount * (BASIS_POINTS_SCALE - BASE_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_PYUSD_TO_SUSDAI);
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
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.interest, METRICS.ASSET_YIELDS_GPU_FINANCING);
    dailyRevenue.add(response.loanOriginateds[0].currencyToken.id, log.interest * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL);
    dailySupplySideRevenue.add(response.loanOriginateds[0].currencyToken.id, log.interest * (BASIS_POINTS_SCALE - GPU_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_SUSDAI);
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
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.originationFee, METRICS.GPU_FINANCING_ORIGINATION_FEE);
    dailyRevenue.add(response.loanOriginateds[0].currencyToken.id, log.originationFee, METRICS.GPU_FINANCING_ORIGINATION_FEE_TO_PROTOCOL);
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
    dailyFees.add(response.loanOriginateds[0].currencyToken.id, log.exitFee, METRICS.GPU_FINANCING_EXIT_FEE);
    dailyRevenue.add(response.loanOriginateds[0].currencyToken.id, log.exitFee, METRICS.GPU_FINANCING_EXIT_FEE_TO_PROTOCOL);
  }

  // GPU-financing repayment yield from loan router v2
  const gpuLenderRepaidV2Logs = await options.getLogs({
    target: LOAN_ROUTER_V2,
    eventAbi: LENDER_REPAID_EVENT_ABI
  });
  for (const log of gpuLenderRepaidV2Logs) {
    const currencyToken = await getV2CurrencyToken(log.loanTermsHash);
    dailyFees.add(currencyToken, log.interest, METRICS.ASSET_YIELDS_GPU_FINANCING);
    dailyRevenue.add(currencyToken, log.interest * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL);
    dailySupplySideRevenue.add(currencyToken, log.interest * (BASIS_POINTS_SCALE - GPU_YIELD_ADMIN_FEE_RATE) / BASIS_POINTS_SCALE, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_SUSDAI);
  }

  // Loan router v2 origination and exit fees, both emitted through the generic FeePaid event
  const v2FeePaidLogs = await options.getLogs({
    target: LOAN_ROUTER_V2,
    eventAbi: FEE_PAID_EVENT_ABI
  });
  for (const log of v2FeePaidLogs) {
    const amount = BigInt(log.amount);

    const kind = Number(log.kind);
    if (kind !== FEE_KIND_ORIGINATION && kind !== FEE_KIND_EXIT) continue;

    // Two origination fees were hijacked to record escrow interest payments. The full amount goes to
    // staked USDai with no admin clip, and the 10% admin fee taken offchain is recorded as amount / 9.
    // Only origination events carry this meaning, so repayments and exits fall through to normal handling.
    if (kind === FEE_KIND_ORIGINATION && ESCROW_INTEREST_LOAN_TERMS_HASHES.has(log.loanTermsHash.toLowerCase())) {
      const protocolFee = amount / 9n;
      dailyFees.add(USDAI, amount + protocolFee, METRICS.ESCROW_TIMELOCK_YIELDS);
      dailyRevenue.add(USDAI, protocolFee, METRICS.ESCROW_TIMELOCK_YIELDS_TO_PROTOCOL);
      dailySupplySideRevenue.add(USDAI, amount, METRICS.ESCROW_TIMELOCK_YIELDS_TO_SUSDAI);
      continue;
    }

    const currencyToken = await getV2CurrencyToken(log.loanTermsHash);
    if (kind === FEE_KIND_ORIGINATION) {
      dailyFees.add(currencyToken, amount, METRICS.GPU_FINANCING_ORIGINATION_FEE);
      dailyRevenue.add(currencyToken, amount, METRICS.GPU_FINANCING_ORIGINATION_FEE_TO_PROTOCOL);
    } else {
      dailyFees.add(currencyToken, amount, METRICS.GPU_FINANCING_EXIT_FEE);
      dailyRevenue.add(currencyToken, amount, METRICS.GPU_FINANCING_EXIT_FEE_TO_PROTOCOL);
    }
  }

  // GPU-financing liquidation fee from loan router v2
  const gpuLiquidationFeeV2Logs = await options.getLogs({
    target: LOAN_ROUTER_V2,
    eventAbi: LIQUIDATION_PROCEEDS_DEPOSITED_EVENT_ABI
  });
  for (const log of gpuLiquidationFeeV2Logs) {
    const currencyToken = await getV2CurrencyToken(log.loanTermsHash);
    dailyFees.add(currencyToken, log.fee + log.surplus, METRICS.GPU_FINANCING_LIQUIDATION_FEE);
    dailyRevenue.add(currencyToken, log.fee + log.surplus, METRICS.GPU_FINANCING_LIQUIDATION_FEE_TO_PROTOCOL);
  }

  // GPU-financing lender liquidation repaid from loan router v2
  const gpuLenderLiquidationRepaidV2Logs = await options.getLogs({
    target: LOAN_ROUTER_V2,
    eventAbi: LENDER_LIQUIDATION_REPAID_EVENT_ABI
  });
  for (const log of gpuLenderLiquidationRepaidV2Logs) {
    const currencyToken = await getV2CurrencyToken(log.loanTermsHash);
    dailyFees.add(currencyToken, log.interest, METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID);
    dailySupplySideRevenue.add(currencyToken, log.interest, METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID_TO_SUSDAI);
  }

  // Escrow timelock interest from withdrawals and cancellations, going to staked USDai with a 10% admin clip
  const escrowWithdrawnLogs = await options.getLogs({
    target: ESCROW_TIMELOCK,
    eventAbi: ESCROW_WITHDRAWN_EVENT_ABI
  });
  const escrowCanceledLogs = await options.getLogs({
    target: ESCROW_TIMELOCK,
    eventAbi: ESCROW_CANCELED_EVENT_ABI
  });
  for (const log of [...escrowWithdrawnLogs, ...escrowCanceledLogs]) {
    const interest = BigInt(log.interest);
    const protocolFee = interest * ESCROW_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE;
    dailyFees.add(USDAI, interest, METRICS.ESCROW_TIMELOCK_YIELDS);
    dailyRevenue.add(USDAI, protocolFee, METRICS.ESCROW_TIMELOCK_YIELDS_TO_PROTOCOL);
    dailySupplySideRevenue.add(USDAI, interest - protocolFee, METRICS.ESCROW_TIMELOCK_YIELDS_TO_SUSDAI);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

// Adapter
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2025-05-13',

  methodology,
  breakdownMethodology
};

export default adapter;