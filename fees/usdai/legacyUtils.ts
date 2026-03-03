import { FetchOptions } from "../../adapters/types";

// Two legacy pools for GPU-financing, both using USDC as currency token

const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const DECODE_LOAN_RECEIPT_ABI = 'function decodeLoanReceipt(bytes calldata loanReceipt) pure returns ((uint8 version, uint256 principal, uint256 repayment, uint256 adminFee, address borrower, uint64 maturity, uint64 duration, address collateralToken, uint256 collateralTokenId, uint16 collateralWrapperContextLen, bytes collateralWrapperContext, (uint128 tick, uint128 used, uint128 pending)[] nodeReceipts))';

// Pool 1
const POOL_1 = '0x0f62b8c58e1039f246d69ba2215ad5bf0d2bb867';
const POOL_1_START_BLOCK = 364010905;

// Pool 2
const POOL_2 = '0xcd9d510c4e2fe45e6ed4fe8a3a30eeef3830cc14';
const POOL_2_START_BLOCK = 355617384;

// 10,000 basis points = 100%, 13.73% of interest going to protocol
const BASIS_POINTS_SCALE = 10_000n;
const ADMIN_FEE_RATE = 1_373n;

interface PoolConfig {
  address: string;
  startBlock: number;
}

export function getLegacyPools(): PoolConfig[] {
  return [
    { address: POOL_1, startBlock: POOL_1_START_BLOCK },
    { address: POOL_2, startBlock: POOL_2_START_BLOCK }
  ];
}

export async function processPoolLoans(
  poolConfig: PoolConfig,
  dailyFees: any,
  dailyRevenue: any,
  dailySupplySideRevenue: any,
  options: FetchOptions
): Promise<void> {
  const { address: poolAddress, startBlock } = poolConfig;

  // Get all loan repaid logs for the pool
  const repaidLogs = await options.getLogs({
    target: poolAddress,
    eventAbi: 'event LoanRepaid(bytes32 indexed loanReceiptHash, uint256 repayment)'
  });

  // Process each loan repaid log
  const originatedLogs = await options.getLogs({
    target: poolAddress,
    eventAbi: 'event LoanOriginated(bytes32 indexed loanReceiptHash, bytes loanReceipt)',
    fromBlock: startBlock,
    cacheInCloud: true
  });

  for (const log of repaidLogs) {

    // Find the originated log for the loan repaid log
    const originatedLog = originatedLogs.find((l: any) => l.loanReceiptHash === log.loanReceiptHash);
    if (!originatedLog) continue;

    try {
      // Decode the loan receipt
      const decoded = await options.api.call({
        target: poolAddress,
        abi: DECODE_LOAN_RECEIPT_ABI,
        params: [originatedLog.loanReceipt]
      });

      // Unscale loan receipt principal from 18 decimals to 6 decimals
      const principal = BigInt(decoded.principal) / 10n ** 12n;
      const repayment = BigInt(log.repayment);
      const interest = repayment - principal;
      const adminFee = interest * ADMIN_FEE_RATE / BASIS_POINTS_SCALE;

      // Add interest to fees, revenue, and supply side revenue
      dailyFees.add(USDC, interest);
      dailyRevenue.add(USDC, adminFee);
      dailySupplySideRevenue.add(USDC, interest - adminFee);
    } catch (e) {
      console.error(`Error processing loan ${log.loanReceiptHash}:`, e);
      throw e
    }
  }
}

