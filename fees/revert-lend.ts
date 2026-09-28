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
 *     Liquidate event parameters: value (collateral asset value), cost (debt repaid by liquidator).
 *     Liquidation penalty = (value > cost) ? (value - cost) : 0n.
 *     The penalty represents the liquidation bonus paid by the liquidated borrower directly to the liquidator.
 * - Revenue Attribution (GAAP Invariant: dailyFees == dailySupplySideRevenue + dailyRevenue):
 *     dailyFees: supplyInterest (BORROW_INTEREST) + protocolRevenue (PROTOCOL_FEES) + liquidationPenalty (LIQUIDATION_FEES)
 *     dailySupplySideRevenue: supplyInterest (BORROW_INTEREST) + liquidationPenalty (LIQUIDATION_FEES)
 *     dailyRevenue: protocolRevenue (PROTOCOL_FEES)
 *     dailyProtocolRevenue: dailyRevenue
 *     dailyHoldersRevenue: 0 (Revert Lend has no staked token dividend distribution; reserves remain in vault).
 */

// Q96 fixed-point constant used across Uniswap V3 and Revert Lend (2^96)
// Reference: V3Vault.sol#L120-L122, V3Vault.sol#L1389
const Q96 = 2n ** 96n;

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
    let grossBorrowInterest = 0n;
    if (toDebtRate > fromDebtRate && fromDebtRate > 0n) {
      const debtRateDelta = toDebtRate - fromDebtRate;
      const debtShares = BigInt(toDebtShares[i] || 0);
      grossBorrowInterest = (debtShares * debtRateDelta) / Q96;
    }

    // Supply interest earned by lenders/depositors: (totalSupply * Delta_lendExchangeRateX96) / Q96
    let supplyInterest = 0n;
    if (toLendRate > fromLendRate && fromLendRate > 0n) {
      const lendRateDelta = toLendRate - fromLendRate;
      const supplyShares = BigInt(toTotalSupplies[i] || 0);
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
      dailyFees.add(asset, protocolInterestRevenue, METRIC.PROTOCOL_FEES);
      dailyRevenue.add(asset, protocolInterestRevenue, METRIC.PROTOCOL_FEES);
    }

    // 4. Query on-chain liquidation events during the period
    // In V3Vault.sol#L797, value is total position value seized, cost is debt repaid by liquidator.
    // Penalty = value - cost is the liquidation bonus earned by the liquidator.
    const liquidationLogs = await options.getLogs({
      target: vault,
      eventAbi: LIQUIDATE_EVENT_ABI,
    });

    for (const log of liquidationLogs) {
      const value = BigInt(log.value || 0);
      const cost = BigInt(log.cost || 0);
      const liquidationPenalty = value > cost ? value - cost : 0n;

      if (liquidationPenalty > 0n) {
        dailyFees.add(asset, liquidationPenalty, METRIC.LIQUIDATION_FEES);
        dailySupplySideRevenue.add(asset, liquidationPenalty, METRIC.LIQUIDATION_FEES);
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
    [METRIC.PROTOCOL_FEES]: "Protocol reserve factor portion of borrow interest retained by the vault reserves.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses paid by liquidated borrowers.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol reserve factor portion of borrow interest retained by the vault reserves.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol reserve factor portion of borrow interest retained by the vault reserves.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest earned by depositors/lenders via lend exchange rate appreciation.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses received by liquidators for repaying undercollateralized debt.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-06-18',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-08-08',
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
