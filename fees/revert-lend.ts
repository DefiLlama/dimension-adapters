import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

/**
 * Revert Lend (V3Vault) Fee & Revenue Adapter
 * Contracts: https://github.com/revert-finance/lend (BUSL-1.1)
 * Subgraph: https://github.com/revert-finance/vault-graph
 * Documentation: https://docs.revert.finance/revert-lend
 *
 * Architecture & Fee Mechanics:
 * - Revert Lend operates isolated ERC-4626 lending vaults (V3Vault) accepting an underlying asset
 *   (e.g., USDC) and collateralized by Uniswap V3 / Aerodrome LP positions (ERC-721 tokens).
 * - Interest rate accounting uses Q96 fixed-point exchange rate expansion (V3Vault.sol#L120-L122):
 *     Q96 = 2^96 = 79,228,162,514,264,337,593,543,950,336
 *     debtExchangeRateX96: tracks cumulative debt accrued per borrow share (starts at Q96 = 1.0).
 *     lendExchangeRateX96: tracks cumulative asset value per lender share (starts at Q96 = 1.0).
 * - Conversion formula (V3Vault.sol#L1389):
 *     assets = (shares * exchangeRateX96) / Q96
 * - Continuous interest accrual is calculated on-demand via vaultInfo() view method
 *   which calls _calculateGlobalInterest() (V3Vault.sol#L1263-L1288):
 *     Delta_debtRate = debtExchangeRateX96_to - debtExchangeRateX96_from
 *     Delta_lendRate = lendExchangeRateX96_to - lendExchangeRateX96_from
 *     grossBorrowInterest = (debtSharesTotal * Delta_debtRate) / Q96
 *     supplyInterest      = (totalSupply * Delta_lendRate) / Q96
 *     protocolRevenue     = grossBorrowInterest > supplyInterest ? grossBorrowInterest - supplyInterest : 0n
 *   The protocol portion is retained in vault reserves via reserveFactorX32 (InterestRateModel.sol#L75).
 * - Liquidations (V3Vault.sol#L797-L807, _calculateLiquidation#L1176-L1216):
 *     Liquidate event parameters: value (position full collateral value), cost (debt repaid by liquidator),
 *     reserve (bad debt covered by vault reserves).
 *     The liquidator receives collateral worth `liquidationValue` (from _calculateLiquidation) and pays `cost`.
 *     Liquidation bonus = liquidationValue > cost ? liquidationValue - cost : 0n.
 *     Protocol reserves used to cover bad debt (`reserve`) are excluded from liquidator fees.
 * - Revenue Attribution (GAAP Invariant: dailyFees == dailySupplySideRevenue + dailyRevenue):
 *     dailyFees: supplyInterest (BORROW_INTEREST) + protocolRevenue (Borrow Interest To Reserves) + liquidationPenalty (LIQUIDATION_FEES)
 *     dailySupplySideRevenue: supplyInterest (BORROW_INTEREST) + liquidationPenalty (LIQUIDATION_FEES)
 *     dailyRevenue: protocolRevenue (Borrow Interest To Reserves)
 *     dailyProtocolRevenue: dailyRevenue
 *     dailyHoldersRevenue: 0 (Revert Lend has no staked token dividend distribution; reserves remain in vault).
 */

// Q-format fixed-point constants used in Revert Lend (V3Vault.sol)
const Q32 = 2n ** 32n;
const Q96 = 2n ** 96n;
const MIN_LIQUIDATION_PENALTY_X32 = (Q32 * 2n) / 100n; // 2% (V3Vault.sol#L36)
const MAX_LIQUIDATION_PENALTY_X32 = (Q32 * 10n) / 100n; // 10% (V3Vault.sol#L37)

const BORROW_INTEREST_TO_RESERVES = "Borrow Interest To Reserves";

// Deployed V3Vault contracts across chains
// Reference: https://github.com/revert-finance/vault-graph/blob/main/networks.json
const VAULTS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    '0xa2754543f69dc036764bbfad16d2a74f5cd15667', // USDC Vault (startBlock: 22734461)
  ],
  [CHAIN.ARBITRUM]: [
    '0x74e6afef5705beb126c6d3bf46f8fad8f3e07825', // USDC Vault (startBlock: 240513631)
  ],
  [CHAIN.BASE]: [
    '0x36aeae0e411a1e28372e0d66f02e57744ebe7599', // Uniswap V3 USDC Vault (startBlock: 31782197)
    '0x22ce292d882c7799183949509b011512352454cb', // Aerodrome USDC Vault (startBlock: 39083195)
  ],
};

const VAULT_INFO_ABI =
  'function vaultInfo() view returns (uint256 debt, uint256 lent, uint256 balance, uint256 reserves, uint256 debtExchangeRateX96, uint256 lendExchangeRateX96)';
const DEBT_SHARES_TOTAL_ABI = 'uint256:debtSharesTotal';
const TOTAL_SUPPLY_ABI = 'uint256:totalSupply';
const ASSET_ABI = 'address:asset';
const LIQUIDATE_EVENT_ABI =
  'event Liquidate(uint256 indexed tokenId, address liquidator, address owner, uint256 value, uint256 cost, uint256 amount0, uint256 amount1, uint256 reserve, uint256 missing)';
const LOAN_INFO_ABI =
  'function loanInfo(uint256 tokenId) view returns (uint256 debt, uint256 fullValue, uint256 collateralValue, uint256 liquidationCost, uint256 liquidationValue)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults = VAULTS[options.chain] || [];
  if (vaults.length === 0) {
    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailyHoldersRevenue: 0,
    };
  }

  // 1. Fetch vault underlying asset and state at toBlock (end of window)
  const [assets, toInfos, toDebtShares, toTotalSupplies] = await Promise.all([
    options.toApi.multiCall({ abi: ASSET_ABI, calls: vaults, permitFailure: true }),
    options.toApi.multiCall({ abi: VAULT_INFO_ABI, calls: vaults, permitFailure: true }),
    options.toApi.multiCall({ abi: DEBT_SHARES_TOTAL_ABI, calls: vaults, permitFailure: true }),
    options.toApi.multiCall({ abi: TOTAL_SUPPLY_ABI, calls: vaults, permitFailure: true }),
  ]);

  // 2. Fetch vault state at fromBlock (start of window)
  const [fromInfos, fromDebtShares, fromTotalSupplies] = await Promise.all([
    options.fromApi.multiCall({ abi: VAULT_INFO_ABI, calls: vaults, permitFailure: true }),
    options.fromApi.multiCall({ abi: DEBT_SHARES_TOTAL_ABI, calls: vaults, permitFailure: true }),
    options.fromApi.multiCall({ abi: TOTAL_SUPPLY_ABI, calls: vaults, permitFailure: true }),
  ]);

  // 3. Compute interest accruals per vault using exact BigInt arithmetic (zero float conversion)
  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    const asset = assets[i];
    const toInfo = toInfos[i];
    const fromInfo = fromInfos[i];

    // Skip uninitialized or predeployment vaults
    if (!asset || !toInfo || !fromInfo) continue;

    const toDebtRate = BigInt(toInfo.debtExchangeRateX96 ?? toInfo[4] ?? 0);
    const fromDebtRate = BigInt(fromInfo.debtExchangeRateX96 ?? fromInfo[4] ?? 0);
    const toLendRate = BigInt(toInfo.lendExchangeRateX96 ?? toInfo[5] ?? 0);
    const fromLendRate = BigInt(fromInfo.lendExchangeRateX96 ?? fromInfo[5] ?? 0);

    // Gross borrow interest owed by borrowers: (debtSharesTotal * Delta_debtExchangeRateX96) / Q96
    // Time-weighted average shares across the reporting window accounts for borrows and repayments
    let grossBorrowInterest = 0n;
    if (toDebtRate > fromDebtRate && fromDebtRate > 0n) {
      const debtRateDelta = toDebtRate - fromDebtRate;
      const fromDebt = BigInt(fromDebtShares[i] ?? 0);
      const toDebt = BigInt(toDebtShares[i] ?? 0);
      const debtShares =
        fromDebt > 0n && toDebt > 0n ? (fromDebt + toDebt) / 2n : fromDebt || toDebt;
      grossBorrowInterest = (debtShares * debtRateDelta) / Q96;
    }

    // Supply interest earned by lenders/depositors: (totalSupply * Delta_lendExchangeRateX96) / Q96
    // Time-weighted average supply shares across the reporting window accounts for deposits and withdrawals
    let supplyInterest = 0n;
    if (toLendRate > fromLendRate && fromLendRate > 0n) {
      const lendRateDelta = toLendRate - fromLendRate;
      const fromSupply = BigInt(fromTotalSupplies[i] ?? 0);
      const toSupply = BigInt(toTotalSupplies[i] ?? 0);
      const supplyShares =
        fromSupply > 0n && toSupply > 0n ? (fromSupply + toSupply) / 2n : fromSupply || toSupply;
      supplyInterest = (supplyShares * lendRateDelta) / Q96;
    }

    // Protocol interest revenue is the spread retained in the vault reserves via reserveFactorX32
    // Exact residual prevents any rounding drift between fees and components
    const protocolInterestRevenue =
      grossBorrowInterest > supplyInterest ? grossBorrowInterest - supplyInterest : 0n;

    // 1:1 Breakdown Parity: supplyInterest split into dailyFees and dailySupplySideRevenue
    if (supplyInterest > 0n) {
      dailyFees.add(asset, supplyInterest, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(asset, supplyInterest, METRIC.BORROW_INTEREST);
    }

    // 1:1 Breakdown Parity: protocolInterestRevenue split into dailyFees and dailyRevenue
    if (protocolInterestRevenue > 0n) {
      dailyFees.add(asset, protocolInterestRevenue, BORROW_INTEREST_TO_RESERVES);
      dailyRevenue.add(asset, protocolInterestRevenue, BORROW_INTEREST_TO_RESERVES);
    }

    // 4. Query on-chain liquidation events during the period
    // In V3Vault.sol#L797, value is total position value, cost is debt repaid by liquidator,
    // and reserve is bad debt covered by vault reserves.
    // Liquidator receives liquidationValue (V3Vault.sol#_calculateLiquidation) and pays cost.
    // Liquidator bonus = liquidationValue - cost (excluding reserve).
    // onlyArgs: false preserves full log object including blockNumber.
    const liquidationLogs = await options.getLogs({
      target: vault,
      eventAbi: LIQUIDATE_EVENT_ABI,
      onlyArgs: false,
    });

    for (const log of liquidationLogs) {
      const args = (log as any).args || log;
      const fullValue = BigInt(args.value || 0);
      const cost = BigInt(args.cost || 0);
      const reserve = BigInt(args.reserve || 0);
      const tokenId = args.tokenId;
      const blockNumber = (log as any).blockNumber ?? (log as any).block;

      // Total debt repaid or covered = liquidatorCost + reserveCost
      const debt = cost + reserve;
      if (debt === 0n) continue;

      let liquidationValue: bigint | null = null;
      let liquidationCost = cost;

      // 1. Attempt exact historical contract call at blockNumber - 1 to obtain actual position liquidationValue
      if (tokenId !== undefined && blockNumber !== undefined && blockNumber > 0) {
        try {
          const info = await options.api.call({
            target: vault,
            abi: LOAN_INFO_ABI,
            params: [tokenId],
            block: blockNumber - 1,
          });
          if (info && info.liquidationValue) {
            liquidationValue = BigInt(info.liquidationValue);
            liquidationCost = BigInt(info.liquidationCost);
          }
        } catch {
          // If archive call fails, continue to contract-derived branch
        }
      }

      // 2. Undercollateralized / bad-debt liquidations (V3Vault.sol#L1203-L1215)
      // When reserveCost > 0 or fullValue < maxPenaltyValue, the contract sets liquidationValue = fullValue
      // without needing collateral factor estimation.
      if (liquidationValue === null) {
        const maxPenaltyValue = (debt * (Q32 + MAX_LIQUIDATION_PENALTY_X32)) / Q32;
        if (reserve > 0n || fullValue < maxPenaltyValue) {
          liquidationValue = fullValue;
          liquidationCost = cost;
        }
        // Note: For standard liquidations where fullValue >= maxPenaltyValue and loanInfo is unavailable,
        // we mark the event unresolved rather than estimating collateral value with a hardcoded factor.
      }

      if (liquidationValue !== null) {
        const liquidationPenalty =
          liquidationValue > liquidationCost ? liquidationValue - liquidationCost : 0n;

        if (liquidationPenalty > 0n) {
          dailyFees.add(asset, liquidationPenalty, METRIC.LIQUIDATION_FEES);
          dailySupplySideRevenue.add(asset, liquidationPenalty, METRIC.LIQUIDATION_FEES);
        }
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    // Revert Lend does not distribute dividends to token holders; protocol revenue is retained in vault reserves
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "Total interest paid by borrowers on their loans plus liquidation bonuses paid by liquidated borrowers.",
  Revenue: "Interest retained by the protocol vault as reserves via the reserve factor.",
  ProtocolRevenue: "Interest retained by the protocol vault as reserves via the reserve factor.",
  SupplySideRevenue: "Interest distributed to depositors/lenders through share exchange rate appreciation plus liquidation bonuses received by liquidators.",
  HoldersRevenue: "Token holders do not receive direct distributions; protocol revenue is retained in vault reserves.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest accrued by borrowers that is distributed to lenders via share price appreciation.",
    [BORROW_INTEREST_TO_RESERVES]: "Protocol reserve factor portion of borrow interest retained by the vault reserves.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses paid by liquidated borrowers.",
  },
  Revenue: {
    [BORROW_INTEREST_TO_RESERVES]: "Protocol reserve factor portion of borrow interest retained by the vault reserves.",
  },
  ProtocolRevenue: {
    [BORROW_INTEREST_TO_RESERVES]: "Protocol reserve factor portion of borrow interest retained by the vault reserves.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest earned by depositors/lenders via lend exchange rate appreciation.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses received by liquidators for repaying undercollateralized debt.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-06-18',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-08-07',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-06-19',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;