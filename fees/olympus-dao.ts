/*
Olympus DAO Comprehensive Fees Adapter

Revenue Sources (Additive Approach):

ETHEREUM:
1. Cooler Loan Interest - Interest accrued on OHM-backed loans
2. sUSDS Yield - Treasury holdings in Sky's savings USDS
3. sUSDe Yield - Treasury holdings in Ethena's staked USDe
4. CD (Clearinghouse Deposit) Facility - Yield from CD positions
5. CD Lending Interest - Interest from loans against pending redemptions
6. POL Fees (OHM/wETH, OHM/sUSDS) - Uniswap V3 LP fees

BASE:
1. POL Fees (OHM/USDC) - Uniswap V3 LP fees

ARBITRUM:
1. POL Fees (WETH/OHM) - Camelot V2 LP fees

Key Contracts & Addresses documented in CHAIN_CONFIG below.

---
NOTE ON CD FACILITY / sUSDS YIELD OVERLAP:
The CD Facility holds sUSDS internally and earns yield. When yield is claimed via
ClaimedYield events, it's transferred to treasury as USDS. To avoid double counting
(once via exchange rate method, once via ClaimedYield), we subtract CD-claimed USDS
from the sUSDS yield calculation before summing revenue sources.
---

---
NOTE ON PENDING REVENUE (as of Jan 2026):
CD Lending has ~$437k in outstanding principal with ~$6k in fixed interest.
Interest is calculated upfront at loan creation. This interest will be
realized when loans are repaid (due dates: April-May 2026). The adapter
will automatically capture this revenue via LoanRepaid events when it occurs.
---
*/

import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// ===========================================
// CHAIN CONFIGURATION
// ===========================================

const CHAIN_CONFIG = {
  ethereum: {
    // Treasury addresses
    treasuryV1: "0xa8687A15D4BE32CC8F0a8a7B9704a4C3993D9613",
    treasuryV2: "0x9A315BdF513367C0377FB36545857d12e85813Ef",
    treasuryMultisig: "0x245cc372C84B3645Bf0Ffe6538620B04a217988B",

    // Revenue source contracts
    monoCooler: "0xdb591Ea2e5Db886dA872654D58f6cc584b68e7cC",
    sUSDS: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
    sUSDe: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
    cdFacility: "0xEBDe552D851DD6Dfd3D360C596D3F4aF6e5F9678",
    cdLending: "0x20a3d8510f2e1176e8db4cea9883a8287a9029db", // DepositRedemptionVault - lending against pending redemptions

    // Uniswap V3 Position Manager
    uniV3PositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",

    // Known position IDs (active positions with liquidity)
    // 562564: OHM/WETH, 954195: OHM/sUSDS
    positionIds: [562564, 954195],

    // Token addresses
    ohm: "0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D5",
    usds: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
    usde: ADDRESSES.ethereum.USDe,
    dai: ADDRESSES.ethereum.DAI,
  },
  base: {
    // Treasury/Multisig address that holds POL positions
    treasury: "0x18a390bd45bcc92652b9a91ad51aed7f1c1358f5",

    // Uniswap V3 Position Manager
    uniV3PositionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",

    // Known position IDs (OHM/USDC)
    positionIds: [1872809],
  },
  arbitrum: {
    // Treasury/Multisig address
    treasury: "0x012bbf0481b97170577745d2167ee14f63e2ad4c",

    // Camelot V2 LP (not V3!) - WETH/OHM pair
    // Fees are auto-compounded into LP, tracked via Swap events
    camelotV2Pool: "0x8acd42e4b5a5750b44a28c5fb50906ebff145359",

    // Token addresses
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    ohm: "0xf0cb2dc0db5e6c66B9a70Ac27B06b878da017028",
  },
};

// ===========================================
// ABI DEFINITIONS
// ===========================================

const ABIS = {
  // ERC-20 balanceOf
  balanceOf: "function balanceOf(address account) view returns (uint256)",

  // ERC-4626 convertToAssets (for sUSDS, sUSDe yield tracking)
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256 assets)",

  // Cooler Loan - MonoCooler
  interestAccumulatorRay: "function interestAccumulatorRay() view returns (uint256)",
  totalDebt: "function totalDebt() view returns (uint256)",

  // Uniswap V3 positions
  positions: "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
};

// Event ABIs
const EVENTS = {
  // Uniswap V3 Collect event
  uniV3Collect: "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",

  // Camelot V2 Swap event (Uniswap V2 style)
  // amount0In/amount1In are the input amounts, amount0Out/amount1Out are outputs
  camelotV2Swap: "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",

  // CD Facility yield claims - emitted when yield is harvested to treasury
  cdClaimedYield: "event ClaimedYield(address indexed asset, uint256 actualYield)",

  // CD Lending - interest paid when loans are repaid
  // Interest portion is transferred to TRSRY in USDS
  cdLendingRepaid: "event LoanRepaid(address indexed user, uint16 indexed redemptionId, uint256 principal, uint256 interest)",
};

// Constants
const RAY = BigInt(10) ** BigInt(27);
const ONE_SHARE = BigInt(10) ** BigInt(18);

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Get treasury addresses for a chain (lowercase for comparison)
 */
function getTreasuryAddresses(chain: string): string[] {
  switch (chain) {
    case CHAIN.ETHEREUM:
      return [
        CHAIN_CONFIG.ethereum.treasuryV1,
        CHAIN_CONFIG.ethereum.treasuryV2,
        CHAIN_CONFIG.ethereum.treasuryMultisig,
      ].map(a => a.toLowerCase());
    case CHAIN.BASE:
      return [CHAIN_CONFIG.base.treasury.toLowerCase()];
    case CHAIN.ARBITRUM:
      return [CHAIN_CONFIG.arbitrum.treasury.toLowerCase()];
    default:
      return [];
  }
}

/**
 * Fetch Cooler Loan interest (Ethereum only)
 * Uses accumulator delta approach: interest = totalDebt * (accAfter - accBefore) / RAY
 */
async function fetchCoolerLoanInterest(options: FetchOptions) {
  const { fromApi, toApi, createBalances } = options;
  const fees = createBalances();

  try {
    const monoCooler = CHAIN_CONFIG.ethereum.monoCooler;

    // Get accumulator and debt at start and end of period
    // Using average debt for more accurate interest calculation
    const [accBefore, accAfter, debtBefore, debtAfter] = await Promise.all([
      fromApi.call({ abi: ABIS.interestAccumulatorRay, target: monoCooler }),
      toApi.call({ abi: ABIS.interestAccumulatorRay, target: monoCooler }),
      fromApi.call({ abi: ABIS.totalDebt, target: monoCooler }),
      toApi.call({ abi: ABIS.totalDebt, target: monoCooler }),
    ]);

    const accDelta = BigInt(accAfter) - BigInt(accBefore);
    const avgDebt = (BigInt(debtBefore) + BigInt(debtAfter)) / BigInt(2);

    if (avgDebt > 0) {
      // Interest = avgDebt * accDelta / RAY
      // Allow negative to avoid phantom yield on break-even edge cases
      const interest = (avgDebt * accDelta) / RAY;
      fees.add(CHAIN_CONFIG.ethereum.dai, interest);
    }
  } catch (e) {
    // Cooler may not be active in early periods
  }

  return fees;
}

/**
 * Fetch ERC-4626 yield for treasury holdings
 * Generic function that works for sUSDS and sUSDe
 */
async function fetchERC4626Yield(
  options: FetchOptions,
  vaultAddress: string,
  underlyingToken: string,
  treasuryAddresses: string[]
) {
  const { api, fromApi, toApi, createBalances } = options;
  const fees = createBalances();

  try {
    // Get total vault token balance at START of period
    // Using fromApi (start) instead of api (end) to avoid overcounting:
    // When yield is claimed and re-wrapped mid-period, those new shares
    // shouldn't have the full period's rate delta applied to them.
    const balances = await fromApi.multiCall({
      abi: ABIS.balanceOf,
      calls: treasuryAddresses.map(t => ({ target: vaultAddress, params: [t] })),
    });

    let totalBalance = BigInt(0);
    for (const balance of balances) {
      totalBalance += BigInt(balance);
    }

    if (totalBalance === BigInt(0)) return fees;

    // Get exchange rate at start and end of period
    const [oldRate, newRate] = await Promise.all([
      fromApi.call({ abi: ABIS.convertToAssets, target: vaultAddress, params: [ONE_SHARE.toString()] }),
      toApi.call({ abi: ABIS.convertToAssets, target: vaultAddress, params: [ONE_SHARE.toString()] }),
    ]);

    const rateDelta = BigInt(newRate) - BigInt(oldRate);
    // Allow negative yield to avoid edge case where rate drop isn't counted
    // but recovery is, creating phantom positive yield on break-even
    const yieldAmount = (rateDelta * totalBalance) / ONE_SHARE;
    fees.add(underlyingToken, yieldAmount);
  } catch (e) {
    // Vault may not exist or treasury may have no holdings in early periods
  }

  return fees;
}

/**
 * Fetch CD Facility revenue (Ethereum only)
 * Tracks yield claims from convertible deposits (sUSDS yield harvested to treasury)
 */
async function fetchCDFacilityRevenue(options: FetchOptions) {
  const fees = options.createBalances();

  try {
    const logs = await options.getLogs({
      target: CHAIN_CONFIG.ethereum.cdFacility,
      eventAbi: EVENTS.cdClaimedYield,
    });

    for (const log of logs) {
      // ClaimedYield event contains asset address and yield amount
      // Yield is denominated in the asset (typically USDS)
      fees.add(log.asset, log.actualYield);
    }
  } catch (e) {
    // CD Facility may not have events in all periods
  }

  return fees;
}

/**
 * Fetch CD Lending interest revenue (Ethereum only)
 * Tracks interest payments from loan repayments on the DepositRedemptionVault
 * Interest is paid in USDS and transferred to TRSRY
 */
async function fetchCDLendingRevenue(options: FetchOptions) {
  const fees = options.createBalances();

  try {
    const logs = await options.getLogs({
      target: CHAIN_CONFIG.ethereum.cdLending,
      eventAbi: EVENTS.cdLendingRepaid,
    });

    for (const log of logs) {
      // LoanRepaid event contains interest amount paid to treasury
      // Interest is denominated in USDS (the deposit token)
      const interest = BigInt(log.interest);
      fees.add(CHAIN_CONFIG.ethereum.usds, interest);
    }
  } catch (e) {
    // CD Lending may not have repayments in all periods
    // This is a new product - loans may still be accruing without repayments
  }

  return fees;
}

/**
 * Fetch Uniswap V3 POL fees
 * Works for Ethereum and Base
 * @param positionIds - Optional list of position IDs to track. If provided, only these positions are counted.
 */
async function fetchUniV3POLFees(
  options: FetchOptions,
  positionManager: string,
  treasuryAddresses: string[],
  positionIds?: number[]
) {
  const fees = options.createBalances();

  try {
    const collectLogs = await options.getLogs({
      target: positionManager,
      eventAbi: EVENTS.uniV3Collect,
    });

    // Filter for collects where recipient is a treasury address AND tokenId is tracked
    const positionIdSet = positionIds ? new Set(positionIds.map(String)) : null;
    const treasuryCollects = collectLogs.filter((log: any) => {
      if (!treasuryAddresses.includes(log.recipient.toLowerCase())) return false;
      // If positionIds specified, only count those positions
      return !positionIdSet || positionIdSet.has(String(log.tokenId));
    });

    // Batch fetch all unique position metadata upfront
    const positionCache = new Map<string, { token0: string; token1: string }>();
    const uniqueTokenIds = [...new Set(treasuryCollects.map((log: any) => String(log.tokenId)))];

    if (uniqueTokenIds.length > 0) {
      try {
        const positions = await options.api.multiCall({
          abi: ABIS.positions,
          calls: uniqueTokenIds.map(tokenId => ({ target: positionManager, params: [tokenId] })),
        });
        positions.forEach((position: any, i: number) => {
          if (position) {
            positionCache.set(uniqueTokenIds[i], { token0: position.token0, token1: position.token1 });
          }
        });
      } catch (e) {
        // Batch fetch failed, positions may have been burned
      }
    }

    for (const log of treasuryCollects) {
      const tokenId = String(log.tokenId);
      const amount0 = log.amount0;
      const amount1 = log.amount1;
      const positionData = positionCache.get(tokenId);

      if (positionData) {
        const { token0, token1 } = positionData;

        if (BigInt(amount0) > 0) {
          fees.add(token0, amount0);
        }
        if (BigInt(amount1) > 0) {
          fees.add(token1, amount1);
        }
      }
    }
  } catch (e) {
    // POL fee tracking may fail in periods with no collects
  }

  return fees;
}

/**
 * Fetch Camelot V2 POL fees on Arbitrum
 * V2 DEX fees are calculated from swap volume.
 *
 * ASSUMPTION: Olympus owns ~100% of LP in this pool.
 * This is validated as of Jan 2026 - Olympus seeded and owns effectively all liquidity.
 * If third-party LPs join, this calculation would overstate Olympus's share.
 * TODO: Consider querying actual LP ownership if pool composition changes.
 */
async function fetchCamelotV2Fees(options: FetchOptions) {
  const fees = options.createBalances();
  const poolAddress = CHAIN_CONFIG.arbitrum.camelotV2Pool;

  try {
    const swapLogs = await options.getLogs({
      target: poolAddress,
      eventAbi: EVENTS.camelotV2Swap,
    });

    // Camelot V2 total fee is 0.3% (30 bps) of input amounts
    // LP share is 0.25% (protocol takes 0.05%)
    // Olympus owns ~100% of LP, so they earn ~100% of LP fees
    const FEE_RATE = BigInt(25); // 0.25% = 25 bps (LP share)
    const BPS = BigInt(10000);

    for (const log of swapLogs) {
      const amount0In = BigInt(log.amount0In);
      const amount1In = BigInt(log.amount1In);

      // Fee is calculated on input amount
      if (amount0In > 0) {
        const fee0 = (amount0In * FEE_RATE) / BPS;
        fees.add(CHAIN_CONFIG.arbitrum.weth, fee0);
      }
      if (amount1In > 0) {
        const fee1 = (amount1In * FEE_RATE) / BPS;
        fees.add(CHAIN_CONFIG.arbitrum.ohm, fee1);
      }
    }
  } catch (e) {
    // V2 swap tracking may fail in periods with no swaps
  }

  return fees;
}

// ===========================================
// CHAIN-SPECIFIC FETCH FUNCTIONS
// ===========================================

/**
 * Fetch Ethereum revenue
 */
async function fetchEthereum(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const treasuryAddresses = getTreasuryAddresses(CHAIN.ETHEREUM);

  // Fetch all revenue sources in parallel
  const [
    coolerInterest,
    susdsYield,
    susdeYield,
    cdFacilityRevenue,
    cdLendingRevenue,
    polFees,
  ] = await Promise.all([
    fetchCoolerLoanInterest(options),
    fetchERC4626Yield(
      options,
      CHAIN_CONFIG.ethereum.sUSDS,
      CHAIN_CONFIG.ethereum.usds,
      // Include CD Facility since it holds sUSDS and earns yield
      // (we subtract CD-claimed amounts later to avoid double counting)
      [CHAIN_CONFIG.ethereum.treasuryV1, CHAIN_CONFIG.ethereum.treasuryV2, CHAIN_CONFIG.ethereum.treasuryMultisig, CHAIN_CONFIG.ethereum.cdFacility]
    ),
    fetchERC4626Yield(
      options,
      CHAIN_CONFIG.ethereum.sUSDe,
      CHAIN_CONFIG.ethereum.usde,
      [CHAIN_CONFIG.ethereum.treasuryV1, CHAIN_CONFIG.ethereum.treasuryV2, CHAIN_CONFIG.ethereum.treasuryMultisig]
    ),
    fetchCDFacilityRevenue(options),
    fetchCDLendingRevenue(options),
    fetchUniV3POLFees(options, CHAIN_CONFIG.ethereum.uniV3PositionManager, treasuryAddresses, CHAIN_CONFIG.ethereum.positionIds),
  ]);

  // Combine all sources
  dailyFees.addBalances(coolerInterest);
  dailyFees.addBalances(susdeYield);
  dailyFees.addBalances(cdLendingRevenue);
  dailyFees.addBalances(polFees);

  // Handle sUSDS yield and CD Facility revenue carefully to avoid double counting.
  // The CD Facility holds sUSDS and claims yield via ClaimedYield events. When claimed,
  // this yield transfers to treasury as USDS. The sUSDS exchange rate method would also
  // capture this yield growth, leading to ~0.02% overstatement. To fix this, we subtract
  // any USDS claimed by the CD Facility from the sUSDS yield calculation.
  const usdsAddress = CHAIN_CONFIG.ethereum.usds.toLowerCase();
  const cdBalances = cdFacilityRevenue.getBalances();
  const cdClaimedUsds = BigInt(cdBalances[usdsAddress] || 0);

  if (cdClaimedUsds > BigInt(0)) {
    // Subtract CD claimed USDS from sUSDS yield to get net treasury sUSDS yield
    const susdsBalances = susdsYield.getBalances();
    const susdsUsdsYield = BigInt(susdsBalances[usdsAddress] || 0);
    const netSusdsYield = susdsUsdsYield - cdClaimedUsds;

    // Add the adjusted sUSDS yield (only the portion not already claimed via CD Facility)
    // Allow negative to avoid phantom yield on break-even edge cases
    dailyFees.add(CHAIN_CONFIG.ethereum.usds, netSusdsYield);
    // Add CD Facility revenue (the actual claimed amount)
    dailyFees.addBalances(cdFacilityRevenue);
  } else {
    // No CD claims this period, add both normally
    dailyFees.addBalances(susdsYield);
    dailyFees.addBalances(cdFacilityRevenue);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

/**
 * Fetch Base revenue
 */
async function fetchBase(options: FetchOptions) {
  const treasuryAddresses = getTreasuryAddresses(CHAIN.BASE);

  const dailyFees = await fetchUniV3POLFees(
    options,
    CHAIN_CONFIG.base.uniV3PositionManager,
    treasuryAddresses,
    CHAIN_CONFIG.base.positionIds
  );

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

/**
 * Fetch Arbitrum revenue
 * Uses Camelot V2 LP (WETH/OHM) - fees from swap volume
 */
async function fetchArbitrum(options: FetchOptions) {
  const dailyFees = await fetchCamelotV2Fees(options);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

// ===========================================
// ADAPTER EXPORT
// ===========================================

const methodology = {
  Fees: "Total revenue from all protocol sources: Cooler Loan interest, sUSDS/sUSDe treasury yield, CD Facility yield, CD Lending interest, and POL (Protocol-Owned Liquidity) fees across all chains",
  Revenue: "Sum of all protocol revenue streams - as a reserve currency protocol, all revenue strengthens the treasury backing OHM",
  ProtocolRevenue: "100% of revenue flows to protocol treasury, funding YRF buybacks that increase backing per OHM. Holder value accrual via improved Cooler Loan LTV will be tracked in a separate Lending adapter.",
};

const adapter: SimpleAdapter = {
  version: 2,
  allowNegativeValue: true, // Yield rates can temporarily decrease; allowing negative prevents phantom yield on recovery
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: "2023-01-01",
    },
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: "2024-01-01",
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchArbitrum,
      start: "2024-01-01",
    },
  },
  methodology,
};

export default adapter;
