import { CHAIN } from "../../helpers/chains";

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { processPoolLoans, getLegacyPools } from "./legacyUtils";
import { request, gql } from "graphql-request";
import { METRICS } from "./metrics";
import { ChainApi } from "@defillama/sdk";

// Loan Router Subgraph API
const LOAN_ROUTER_SUBGRAPH_API = 'https://api.goldsky.com/api/public/project_clzibgddg2epg01ze4lq55scx/subgraphs/loan_router_arbitrum/0.0.3/gn';
// Goldsky subgraph indexing the v2 loan router on Arbitrum, used to look up the currency token per loan terms hash
const LOAN_ROUTER_V2_SUBGRAPH_API = 'https://api.goldsky.com/api/public/project_cmgziqwja00105np2g1gy6stc/subgraphs/loan_router_v2_arbitrum/latest/gn';

// Wrapped M
const WRAPPED_M = '0x437cc33344a0B27A429f795ff6B469C72698B291';
const CLAIMED_EVENT_ABI = 'event Claimed(address indexed account, address indexed recipient, uint240 yield)';

// USDai
const USDAI = '0x0A1a1A107E45b7Ced86833863f482BC5f4ed82EF';
const HARVEST_EVENT_ABI = 'event Harvested(uint256 usdaiAmount)';
const BASE_YIELD_ACCRUED_ABI = 'uint256:baseYieldAccrued';
// USDai v1.4 introduced on-chain PYUSD yield accrual at block 427942520.
// https://arbiscan.io/tx/0xf0e6608ef53be933406ced52516378a8334063f0aa20ccbc3b0c6cb1a3f9610f
const BASE_YIELD_ACCRUAL_START_BLOCK = 427942520;

// Staked USDai
const SUSDAI = '0x0B2b2B2076d95dda7817e785989fE353fe955ef9';
const LEGACY_LOAN_ROUTER_BALANCES_ABI = 'function loanRouterBalances() view returns (uint256 repaymentLoanBalance, uint256 pendingLoanBalance, uint256 accruedLoanInterestBalance)';
const LOAN_ROUTER_BALANCES_ABI = 'function loanRouterBalances() view returns (uint256 pendingLoanBalance, uint256 accruedLoanInterestBalance)';
// The first loan managed by sUSDai originated at block 407590965.
// https://arbiscan.io/tx/0xe48d23442e64a191e0ae7e68f44b0623b48f4dd1d8a145cc9e396eb9765a53ac
const LOAN_ACCRUAL_START_BLOCK = 407590965;
// StakedUSDai v1.11 changed loanRouterBalances from three values to two at block 488651542.
// https://arbiscan.io/tx/0xd686ef5aa34de0aac637c22560cdaeca1b6c42a8c4127fd1270d7230d3f23632
const LOAN_ROUTER_BALANCES_V2_BLOCK = 488651542;

// Loan Router
const LOAN_ROUTER = '0x0C2ED170F2bB1DF1a44292Ad621B577b3C9597D1';
// v2 loan router contract: https://arbiscan.io/address/0x1C2ED170de32846316784c4fd58A5e3C7563E12f
const LOAN_ROUTER_V2 = '0x1C2ED170de32846316784c4fd58A5e3C7563E12f';
const LOAN_ORIGINATED_EVENT_ABI = 'event LoanOriginated(bytes32 indexed loanTermsHash, address indexed borrower, address indexed currencyToken, uint256 principal, uint256 originationFee)';
const LENDER_REPAID_EVENT_ABI = 'event LenderRepaid(bytes32 indexed loanTermsHash,address indexed lender,uint8 indexed trancheIndex,uint256 principal,uint256 interest,uint256 prepay)';
const LOAN_REPAID_EVENT_ABI = 'event LoanRepaid(bytes32 indexed loanTermsHash, address indexed borrower, uint256 principal, uint256 interest, uint256 prepayment, uint256 exitFee, bool isRepaid)';
// HookFailed(string) comes from the published loan-router source (the deployed routers are ERC-1967
// proxies). A failed sUSDai hook can leave loanRouterBalances() stale, so a window containing one
// throws. No HookFailed was emitted on either router through block 525095470 (2026-11-17).
// https://github.com/usdai-foundation/usdai-loan-router-contracts/blob/main/src/LoanLogicV2.sol
// https://arbiscan.io/address/0x1C2ED170de32846316784c4fd58A5e3C7563E12f#events
const HOOK_FAILED_EVENT_ABI = 'event HookFailed(string reason)';

// Loan router v2 emits all fees through a generic FeePaid event (kind: 0 origination, 1 repayment, 2 exit, 3 liquidation, 4 refinance)
const FEE_PAID_EVENT_ABI = 'event FeePaid(bytes32 indexed loanTermsHash, uint8 indexed kind, address indexed recipient, address feeModel, uint256 amount)';
const TRANSFER_FAILED_EVENT_ABI = 'event TransferFailed(address indexed token, address indexed recipient, address indexed intendedRecipient, uint256 amount)';
// FeePaid kind enum on the v2 loan router: 0 origination, 1 repayment, 2 exit, 3 liquidation, 4 refinance
const FEE_KIND_ORIGINATION = 0;
const FEE_KIND_EXIT = 2;
const FEE_KIND_REFINANCE = 4;

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
const ESCROW_ACCRUED_ABI = 'uint256:accrued';
// The escrow timelock was deployed at block 477566857.
const ESCROW_ACCRUAL_START_BLOCK = 477566857;

const loanOriginatedByHashQuery = gql`
  query GetLoanOriginationByHash($loanTermsHash: Bytes!) {
    loanOriginateds(where: { loanTermsHash: $loanTermsHash }, first: 1) {
      currencyToken {
        id
      }
    }
  }
`;

const loanByHashQuery = gql`
  query GetLoanByHash($loanTermsHash: ID!) {
    loan(id: $loanTermsHash) {
      currencyToken
    }
  }
`;

// 10,000 basis points = 100%, 10% of interest going to protocol
const BASIS_POINTS_SCALE = 10_000n;
const BASE_YIELD_ADMIN_FEE_RATE = 1_000n;
const GPU_YIELD_ADMIN_FEE_RATE = 1_000n;
// 10% of escrow timelock interest goes to the protocol, matching the base and GPU yield admin rates
const ESCROW_YIELD_ADMIN_FEE_RATE = 1_000n;
const normalizeUsdai = (token: string) =>
  token.toLowerCase() === USDAI.toLowerCase() ? USDAI : token;

// Methodology
const methodology = {
  Fees: "Interest earned on USDai's reserves (T-bill-backed wrapped M and PYUSD), on GPU-backed loans and on escrowed deposits, plus origination, exit, refinance and liquidation fees paid by borrowers. PYUSD, loan and escrow interest is counted as it accrues; when a loan repayment pays less interest than had accrued, the difference is subtracted on that day.",
  Revenue: "The protocol's 10% admin fee on interest from USDai's reserves, GPU-backed loans and escrowed deposits, plus origination, exit and liquidation fees paid by borrowers.",
  ProtocolRevenue: "The protocol's 10% admin fee on interest from USDai's reserves, GPU-backed loans and escrowed deposits, plus origination, exit and liquidation fees paid by borrowers, all sent to the protocol treasury.",
  SupplySideRevenue: "Interest from USDai's reserves, GPU-backed loans and escrowed deposits paid to staked USDai holders after the 10% admin fee, plus refinance fees and interest recovered from liquidated loans."
};

const breakdownMethodology = {
  Fees: {
    [METRICS.ASSET_YIELDS_WRAPPED_M]: 'Asset yields from wrapped M (Tbill backed yields)',
    [METRICS.ASSET_YIELDS_PYUSD]: 'Asset yields from PYUSD',
    [METRICS.ASSET_YIELDS_GPU_FINANCING]: 'Interest on GPU-backed loans. USDai loans held by staked USDai are counted as interest accrues, and a repayment that pays less interest than had accrued reduces that day; older PYUSD and USDC loans are counted when repaid',
    [METRICS.GPU_FINANCING_ORIGINATION_FEE]: 'GPU-financing origination fee',
    [METRICS.GPU_FINANCING_REFINANCE_FEE]: 'Fees paid by borrowers when refinancing a GPU-backed loan',
    [METRICS.GPU_FINANCING_EXIT_FEE]: 'GPU-financing exit fee',
    [METRICS.GPU_FINANCING_LIQUIDATION_FEE]: 'GPU-financing liquidation fee',
    [METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID]: 'GPU-financing lender liquidation repaid',
    [METRICS.ESCROW_TIMELOCK_YIELDS]: 'Escrow timelock yields',
  },
  Revenue: {
    [METRICS.ASSET_YIELDS_WRAPPED_M_TO_PROTOCOL]: 'Asset yields from wrapped M to protocol',
    [METRICS.ASSET_YIELDS_PYUSD_TO_PROTOCOL]: 'Asset yields from PYUSD to protocol',
    [METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL]: '10% admin fee on GPU-backed loan interest',
    [METRICS.GPU_FINANCING_ORIGINATION_FEE_TO_PROTOCOL]: 'GPU-financing origination fee to protocol',
    [METRICS.GPU_FINANCING_EXIT_FEE_TO_PROTOCOL]: 'GPU-financing exit fee to protocol',
    [METRICS.GPU_FINANCING_LIQUIDATION_FEE_TO_PROTOCOL]: 'GPU-financing liquidation fee to protocol',
    [METRICS.ESCROW_TIMELOCK_YIELDS_TO_PROTOCOL]: 'Escrow timelock yields to protocol',
  },
  ProtocolRevenue: {
    [METRICS.ASSET_YIELDS_WRAPPED_M_TO_PROTOCOL]: 'Asset yields from wrapped M to protocol',
    [METRICS.ASSET_YIELDS_PYUSD_TO_PROTOCOL]: 'Asset yields from PYUSD to protocol',
    [METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL]: '10% admin fee on GPU-backed loan interest',
    [METRICS.GPU_FINANCING_ORIGINATION_FEE_TO_PROTOCOL]: 'GPU-financing origination fee to protocol',
    [METRICS.GPU_FINANCING_EXIT_FEE_TO_PROTOCOL]: 'GPU-financing exit fee to protocol',
    [METRICS.GPU_FINANCING_LIQUIDATION_FEE_TO_PROTOCOL]: 'GPU-financing liquidation fee to protocol',
    [METRICS.ESCROW_TIMELOCK_YIELDS_TO_PROTOCOL]: 'Escrow timelock yields to protocol',
  },
  SupplySideRevenue: {
    [METRICS.ASSET_YIELDS_WRAPPED_M_TO_SUSDAI]: 'Asset yields from wrapped M to staked USDai',
    [METRICS.ASSET_YIELDS_PYUSD_TO_SUSDAI]: 'Asset yields from PYUSD to staked USDai',
    [METRICS.ASSET_YIELDS_GPU_FINANCING_TO_SUSDAI]: 'GPU-backed loan interest paid to staked USDai after the 10% admin fee',
    [METRICS.GPU_FINANCING_REFINANCE_FEE_TO_SUSDAI]: 'Refinance fees, paid in full to staked USDai with no admin fee',
    [METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID_TO_SUSDAI]: 'GPU-financing lender liquidation repaid to staked USDai',
    [METRICS.ESCROW_TIMELOCK_YIELDS_TO_SUSDAI]: 'Escrow timelock yields to staked USDai',
  },
}

async function getAccruedValue(api: any, startBlock: number, target: string, abi: string): Promise<bigint> {
  if (api.block < startBlock) return 0n;
  return BigInt(await api.call({ target, abi }));
}

async function getLoanInterestAccrued(api: any): Promise<bigint> {
  if (api.block < LOAN_ACCRUAL_START_BLOCK) return 0n;

  if (api.block < LOAN_ROUTER_BALANCES_V2_BLOCK) {
    const balances = await api.call({ target: SUSDAI, abi: LEGACY_LOAN_ROUTER_BALANCES_ABI });
    return BigInt(balances[2]);
  }

  const balances = await api.call({ target: SUSDAI, abi: LOAN_ROUTER_BALANCES_ABI });
  return BigInt(balances[1]);
}

// Fetch function
const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const openingBlock = await options.getFromBlock() - 1;
  const openingApi = new ChainApi({ chain: options.chain, block: openingBlock });
  const closingBlock = await options.getToBlock();
  const loanInterestAtBlock = new Map<number, Promise<bigint>>();
  const getLoanInterestAtBlock = (block: number): Promise<bigint> => {
    let value = loanInterestAtBlock.get(block);
    if (!value) {
      value = getLoanInterestAccrued(new ChainApi({ chain: options.chain, block }));
      loanInterestAtBlock.set(block, value);
    }
    return value;
  };
  const getLoanInterestRemovedAtBlock = async (block: number): Promise<{
    interest: bigint,
    protocolFee: bigint,
  }> => {
    const [before, after] = await Promise.all([
      getLoanInterestAtBlock(block - 1),
      getLoanInterestAtBlock(block),
    ]);
    if (before <= after) return { interest: 0n, protocolFee: 0n };
    return {
      interest: before - after,
      protocolFee:
        before * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE
        - after * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE,
    };
  };

  const [
    baseYieldAccruedBefore,
    baseYieldAccruedAfter,
    loanInterestAccruedBefore,
    loanInterestAccruedAfter,
    escrowInterestAccruedBefore,
    escrowInterestAccruedAfter,
  ] = await Promise.all([
    getAccruedValue(openingApi, BASE_YIELD_ACCRUAL_START_BLOCK, USDAI, BASE_YIELD_ACCRUED_ABI),
    getAccruedValue(options.toApi, BASE_YIELD_ACCRUAL_START_BLOCK, USDAI, BASE_YIELD_ACCRUED_ABI),
    getLoanInterestAtBlock(openingBlock),
    getLoanInterestAtBlock(closingBlock),
    getAccruedValue(openingApi, ESCROW_ACCRUAL_START_BLOCK, ESCROW_TIMELOCK, ESCROW_ACCRUED_ABI),
    getAccruedValue(options.toApi, ESCROW_ACCRUAL_START_BLOCK, ESCROW_TIMELOCK, ESCROW_ACCRUED_ABI),
  ]);

  // Look up the currency token for a v2 loan, caching by loan terms hash so repeated lookups across
  // the repayment, fee, and liquidation loops hit the subgraph only once per loan.
  const v2CurrencyTokenCache = new Map<string, Promise<string>>();
  const getV2CurrencyToken = (loanTermsHash: string): Promise<string> => {
    let cached = v2CurrencyTokenCache.get(loanTermsHash);
    if (!cached) {
      cached = request(LOAN_ROUTER_V2_SUBGRAPH_API, loanByHashQuery, { loanTermsHash })
        .then((response: any) => {
          if (!response.loan?.currencyToken) {
            throw new Error(`No v2 loan found for loan terms hash ${loanTermsHash}`);
          }
          return normalizeUsdai(response.loan.currencyToken);
        });
      v2CurrencyTokenCache.set(loanTermsHash, cached);
    }
    return cached;
  };

  // Wrapped M Claimed yield paid to sUSDai runs in parallel with baseYieldAccrued(). Claims continued
  // after block 427942520 (2026-02-02) through block 436315837 (2026-02-26). The getter does not
  // include those claims, so both streams are counted.
  const wrappedMBaseYieldLogs = await options.getLogs({
    target: WRAPPED_M,
    eventAbi: CLAIMED_EVENT_ABI
  });
  wrappedMBaseYieldLogs.filter((log: any) => log.recipient === SUSDAI).forEach((log: any) => {
    const protocolFee = log.yield * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE;
    dailyFees.add(WRAPPED_M, log.yield, METRICS.ASSET_YIELDS_WRAPPED_M);
    dailyRevenue.add(WRAPPED_M, protocolFee, METRICS.ASSET_YIELDS_WRAPPED_M_TO_PROTOCOL);
    dailySupplySideRevenue.add(WRAPPED_M, log.yield - protocolFee, METRICS.ASSET_YIELDS_WRAPPED_M_TO_SUSDAI);
  });

  // PYUSD base yield accrues continuously. Harvesting clears baseYieldAccrued, so add harvested
  // amounts back to the snapshot delta to keep the metric on an accrual basis.
  const pyusdBaseYieldLogs = await options.getLogs({
    target: USDAI,
    eventAbi: HARVEST_EVENT_ABI
  });
  const harvestedBaseYield = pyusdBaseYieldLogs.reduce((sum: bigint, log: any) => sum + BigInt(log.usdaiAmount), 0n);
  const harvestedBaseYieldProtocolFee = pyusdBaseYieldLogs.reduce(
    (sum: bigint, log: any) => sum + BigInt(log.usdaiAmount) * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE,
    0n,
  );
  const accruedBaseYield = baseYieldAccruedAfter - baseYieldAccruedBefore + harvestedBaseYield;
  const baseYieldProtocolFee =
    baseYieldAccruedAfter * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE
    - baseYieldAccruedBefore * BASE_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE
    + harvestedBaseYieldProtocolFee;
  dailyFees.add(USDAI, accruedBaseYield, METRICS.ASSET_YIELDS_PYUSD);
  dailyRevenue.add(USDAI, baseYieldProtocolFee, METRICS.ASSET_YIELDS_PYUSD_TO_PROTOCOL);
  dailySupplySideRevenue.add(USDAI, accruedBaseYield - baseYieldProtocolFee, METRICS.ASSET_YIELDS_PYUSD_TO_SUSDAI);

  // Legacy pools for GPU-financing
  const pools = getLegacyPools();
  await Promise.all(
    pools.map(pool => processPoolLoans(pool, dailyFees, dailyRevenue, dailySupplySideRevenue, options))
  );

  // HookFailed does not name the hook, so any failure in this window makes the accrual read
  // unreliable. Only this window is rejected: blocking every later window would halt all fee
  // sources until a manual code change.
  const hookFailedLogs = await options.getLogs({
    targets: [LOAN_ROUTER, LOAN_ROUTER_V2],
    eventAbi: HOOK_FAILED_EVENT_ABI,
    onlyArgs: false,
  });
  if (hookFailedLogs.length > 0) {
    throw new Error(`USDai loan router hook failed in transaction ${hookFailedLogs[0].transactionHash}`);
  }

  // Interest repaid to sUSDai on USDai loans. These settlements clear the accrual getter, so the
  // receipts are added back to its delta below. Each receipt's admin fee is rounded separately.
  let usdaiSettledInterest = 0n;
  let usdaiSettledProtocolFee = 0n;
  const usdaiSettlementBlocks = new Set<number>();
  const addUsdaiSettlement = (rawLog: any) => {
    const interest = BigInt(rawLog.args.interest);
    usdaiSettledInterest += interest;
    usdaiSettledProtocolFee += interest * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE;
    usdaiSettlementBlocks.add(Number(rawLog.blockNumber));
  };

  // GPU-financing repayment yield from loan router
  const gpuLenderRepaidLogs = await options.getLogs({
    target: LOAN_ROUTER,
    eventAbi: LENDER_REPAID_EVENT_ABI,
    onlyArgs: false,
  });
  for (const rawLog of gpuLenderRepaidLogs) {
    const log = rawLog.args;
    // Get loan origination entity using loan terms hash to get currency token
    const response = await request(LOAN_ROUTER_SUBGRAPH_API, loanOriginatedByHashQuery, {
      loanTermsHash: log.loanTermsHash
    });
    const currencyToken = normalizeUsdai(response.loanOriginateds[0].currencyToken.id);
    if (
      currencyToken.toLowerCase() === USDAI.toLowerCase()
      && log.lender.toLowerCase() === SUSDAI.toLowerCase()
    ) {
      addUsdaiSettlement(rawLog);
      continue;
    }
    const protocolFee = log.interest * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE;
    dailyFees.add(currencyToken, log.interest, METRICS.ASSET_YIELDS_GPU_FINANCING);
    dailyRevenue.add(currencyToken, protocolFee, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL);
    dailySupplySideRevenue.add(currencyToken, log.interest - protocolFee, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_SUSDAI);
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
    const currencyToken = normalizeUsdai(response.loanOriginateds[0].currencyToken.id);
    dailyFees.add(currencyToken, log.originationFee, METRICS.GPU_FINANCING_ORIGINATION_FEE);
    dailyRevenue.add(currencyToken, log.originationFee, METRICS.GPU_FINANCING_ORIGINATION_FEE_TO_PROTOCOL);
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
    const currencyToken = normalizeUsdai(response.loanOriginateds[0].currencyToken.id);
    dailyFees.add(currencyToken, log.exitFee, METRICS.GPU_FINANCING_EXIT_FEE);
    dailyRevenue.add(currencyToken, log.exitFee, METRICS.GPU_FINANCING_EXIT_FEE_TO_PROTOCOL);
  }

  // GPU-financing repayment yield from loan router v2
  const gpuLenderRepaidV2Logs = await options.getLogs({
    target: LOAN_ROUTER_V2,
    eventAbi: LENDER_REPAID_EVENT_ABI,
    onlyArgs: false,
  });
  for (const rawLog of gpuLenderRepaidV2Logs) {
    const log = rawLog.args;
    const currencyToken = await getV2CurrencyToken(log.loanTermsHash);
    const clearsUsdaiAccrual = currencyToken.toLowerCase() === USDAI.toLowerCase()
      && log.lender.toLowerCase() === SUSDAI.toLowerCase();
    if (clearsUsdaiAccrual) {
      addUsdaiSettlement(rawLog);
      continue;
    }
    const protocolFee = log.interest * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE;
    dailyFees.add(currencyToken, log.interest, METRICS.ASSET_YIELDS_GPU_FINANCING);
    dailyRevenue.add(currencyToken, protocolFee, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL);
    dailySupplySideRevenue.add(currencyToken, log.interest - protocolFee, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_SUSDAI);
  }

  // Successful settlements clear accrued interest from loanRouterBalances. Reconcile every
  // settlement block below, while this delta adds interest earned but not yet settled.
  let accruedLoanInterest = loanInterestAccruedAfter - loanInterestAccruedBefore;
  let accruedLoanProtocolFee =
    loanInterestAccruedAfter * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE
    - loanInterestAccruedBefore * GPU_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE;

  // Loan router v2 fees emitted through the generic FeePaid event.
  const v2FeePaidLogs = await options.getLogs({
    target: LOAN_ROUTER_V2,
    eventAbi: FEE_PAID_EVENT_ABI,
    onlyArgs: false,
  });
  let migratedEscrowInterest = 0n;
  let migratedEscrowProtocolFee = 0n;
  let migratedLoanInterest = 0n;
  let migratedLoanProtocolFee = 0n;
  const migrationBlocks = new Set<number>();
  let transferFailedLogs: Awaited<ReturnType<typeof options.getLogs>> | undefined;
  for (const rawLog of v2FeePaidLogs) {
    const log = rawLog.args;
    const amount = BigInt(log.amount);

    const kind = Number(log.kind);
    if (kind === FEE_KIND_REFINANCE) {
      if (amount === 0n) continue;
      if (log.recipient.toLowerCase() !== SUSDAI.toLowerCase()) {
        throw new Error(`Cannot attribute USDai refinance recipient ${log.recipient}`);
      }
      if (!rawLog.transactionHash) throw new Error('USDai refinance fee is missing its transaction hash');
      const currencyToken = await getV2CurrencyToken(log.loanTermsHash);
      transferFailedLogs ??= await options.getLogs({
        target: LOAN_ROUTER_V2,
        eventAbi: TRANSFER_FAILED_EVENT_ABI,
        onlyArgs: false,
      });
      // FeePaid retains the intended recipient after _transferOrRedirect. TransferFailed has no
      // loan hash, so any matching transaction/token/recipient failure makes attribution ambiguous.
      for (const failure of transferFailedLogs) {
        const args = failure.args;
        if (BigInt(args.amount) === 0n || args.token.toLowerCase() !== currencyToken.toLowerCase()
          || args.intendedRecipient.toLowerCase() !== SUSDAI.toLowerCase()) continue;
        if (!failure.transactionHash) throw new Error('USDai refinance transfer failure is missing its transaction hash');
        if (failure.transactionHash.toLowerCase() === rawLog.transactionHash.toLowerCase()) {
          throw new Error(`Cannot attribute redirected USDai refinance transfer in ${rawLog.transactionHash}`);
        }
      }
      // The sUSDai fee hook credits the entire receipt to deposits, without an admin clip.
      dailyFees.add(currencyToken, amount, METRICS.GPU_FINANCING_REFINANCE_FEE);
      dailySupplySideRevenue.add(currencyToken, amount, METRICS.GPU_FINANCING_REFINANCE_FEE_TO_SUSDAI);
      continue;
    }
    if (kind !== FEE_KIND_ORIGINATION && kind !== FEE_KIND_EXIT) continue;

    // Two origination fees were hijacked to record escrow interest payments. The full amount goes to
    // staked USDai with no admin clip, and the 10% admin fee taken offchain is recorded as amount / 9.
    // Only origination events carry this meaning, so repayments and exits fall through to normal handling.
    if (kind === FEE_KIND_ORIGINATION && ESCROW_INTEREST_LOAN_TERMS_HASHES.has(log.loanTermsHash.toLowerCase())) {
      const protocolFee = amount / 9n;
      const grossInterest = amount + protocolFee;
      const block = Number(rawLog.blockNumber);
      if (migrationBlocks.has(block)) {
        throw new Error(`Cannot attribute multiple USDai migrations in block ${block}`);
      }
      migrationBlocks.add(block);
      const removedLoan = await getLoanInterestRemovedAtBlock(block);
      if (removedLoan.interest > grossInterest) {
        throw new Error(`USDai loan interest removed at migration block ${rawLog.blockNumber} exceeds its escrow receipt`);
      }
      migratedEscrowInterest += grossInterest;
      migratedEscrowProtocolFee += protocolFee;
      migratedLoanInterest += removedLoan.interest;
      migratedLoanProtocolFee += removedLoan.protocolFee;
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
    eventAbi: LENDER_LIQUIDATION_REPAID_EVENT_ABI,
    onlyArgs: false,
  });
  for (const rawLog of gpuLenderLiquidationRepaidV2Logs) {
    const log = rawLog.args;
    const currencyToken = await getV2CurrencyToken(log.loanTermsHash);
    const clearsUsdaiAccrual = currencyToken.toLowerCase() === USDAI.toLowerCase()
      && log.lender.toLowerCase() === SUSDAI.toLowerCase();
    if (clearsUsdaiAccrual) {
      addUsdaiSettlement(rawLog);
      continue;
    }

    dailyFees.add(currencyToken, log.interest, METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID);
    dailySupplySideRevenue.add(currencyToken, log.interest, METRICS.GPU_FINANCING_LENDER_LIQUIDATION_REPAID_TO_SUSDAI);
  }

  // Escrow interest accrues continuously. Withdrawals and cancellations clear accrued(), so add
  // their settled interest back to the snapshot delta.
  const escrowWithdrawnLogs = await options.getLogs({
    target: ESCROW_TIMELOCK,
    eventAbi: ESCROW_WITHDRAWN_EVENT_ABI
  });
  const escrowCanceledLogs = await options.getLogs({
    target: ESCROW_TIMELOCK,
    eventAbi: ESCROW_CANCELED_EVENT_ABI
  });
  const settledEscrowInterest = [...escrowWithdrawnLogs, ...escrowCanceledLogs]
    .reduce((sum: bigint, log: any) => sum + BigInt(log.interest), 0n);
  const settledEscrowProtocolFee = [...escrowWithdrawnLogs, ...escrowCanceledLogs]
    .reduce(
      (sum: bigint, log: any) => sum + BigInt(log.interest) * ESCROW_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE,
      0n,
    );
  const accruedEscrowInterest = escrowInterestAccruedAfter - escrowInterestAccruedBefore
    + settledEscrowInterest + migratedEscrowInterest - migratedLoanInterest;
  const escrowProtocolFee =
    escrowInterestAccruedAfter * ESCROW_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE
    - escrowInterestAccruedBefore * ESCROW_YIELD_ADMIN_FEE_RATE / BASIS_POINTS_SCALE
    + settledEscrowProtocolFee + migratedEscrowProtocolFee - migratedLoanProtocolFee;

  // Migration receipts move previously-accrued interest from the loan getter to escrow. Reclassify
  // the fixed block-local removal so hourly pulls and daily refills produce the same breakdown.
  accruedLoanInterest += migratedLoanInterest;
  accruedLoanProtocolFee += migratedLoanProtocolFee;

  // A migration's getter drop is read per block, so a settlement in the same block would be misattributed.
  for (const block of usdaiSettlementBlocks) {
    if (migrationBlocks.has(block)) {
      throw new Error(`Cannot attribute USDai migration and settlement in block ${block}`);
    }
  }
  // Add actual receipts, not the full getter drop: a repayment or liquidation can clear interest
  // that was accrued but never paid, and that difference is reversed in this window.
  accruedLoanInterest += usdaiSettledInterest;
  accruedLoanProtocolFee += usdaiSettledProtocolFee;

  dailyFees.add(USDAI, accruedLoanInterest, METRICS.ASSET_YIELDS_GPU_FINANCING);
  dailyRevenue.add(USDAI, accruedLoanProtocolFee, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_PROTOCOL);
  dailySupplySideRevenue.add(USDAI, accruedLoanInterest - accruedLoanProtocolFee, METRICS.ASSET_YIELDS_GPU_FINANCING_TO_SUSDAI);

  dailyFees.add(USDAI, accruedEscrowInterest, METRICS.ESCROW_TIMELOCK_YIELDS);
  dailyRevenue.add(USDAI, escrowProtocolFee, METRICS.ESCROW_TIMELOCK_YIELDS_TO_PROTOCOL);
  dailySupplySideRevenue.add(USDAI, accruedEscrowInterest - escrowProtocolFee, METRICS.ESCROW_TIMELOCK_YIELDS_TO_SUSDAI);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

// Adapter
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Settlements can reverse previously accrued interest and its expected admin share; per-receipt
  // fee rounding can also reverse a small amount of protocol accrual. Keep those signed adjustments.
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2025-05-13',

  methodology,
  breakdownMethodology
};

export default adapter;
