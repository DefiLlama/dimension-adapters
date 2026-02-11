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

const CHAIN_CONFIG = {
  ethereum: {
    treasuryV1: "0xa8687A15D4BE32CC8F0a8a7B9704a4C3993D9613",
    treasuryV2: "0x9A315BdF513367C0377FB36545857d12e85813Ef",
    treasuryMultisig: "0x245cc372C84B3645Bf0Ffe6538620B04a217988B",
    monoCooler: "0xdb591Ea2e5Db886dA872654D58f6cc584b68e7cC",
    sUSDS: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
    sUSDe: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
    cdFacility: "0xEBDe552D851DD6Dfd3D360C596D3F4aF6e5F9678",
    cdLending: "0x20a3d8510f2e1176e8db4cea9883a8287a9029db", // DepositRedemptionVault
    uniV3PositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    positionIds: [562564, 954195], // OHM/WETH, OHM/sUSDS
    ohm: "0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D5",
    usds: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
    usde: ADDRESSES.ethereum.USDe,
    dai: ADDRESSES.ethereum.DAI,
  },
  base: {
    treasury: "0x18a390bd45bcc92652b9a91ad51aed7f1c1358f5",
    uniV3PositionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    positionIds: [1872809],
  },
  arbitrum: {
    treasury: "0x012bbf0481b97170577745d2167ee14f63e2ad4c",
    camelotV2Pool: "0x8acd42e4b5a5750b44a28c5fb50906ebff145359", // V2 LP WETH/OHM
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    ohm: "0xf0cb2dc0db5e6c66B9a70Ac27B06b878da017028",
  },
};

const ABIS = {
  balanceOf: "function balanceOf(address account) view returns (uint256)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256 assets)",
  interestAccumulatorRay: "function interestAccumulatorRay() view returns (uint256)",
  totalDebt: "function totalDebt() view returns (uint256)",
  positions: "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
};

const EVENTS = {
  uniV3Collect: "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
  uniV3DecreaseLiquidity: "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  camelotV2Swap: "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  cdClaimedYield: "event ClaimedYield(address indexed asset, uint256 actualYield)",
  cdLendingRepaid: "event LoanRepaid(address indexed user, uint16 indexed redemptionId, uint256 principal, uint256 interest)",
};

const RAY = BigInt(10) ** BigInt(27);
const ONE_SHARE = BigInt(10) ** BigInt(18);

function getTreasuryAddresses(chain: string): string[] {
  const config: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
      CHAIN_CONFIG.ethereum.treasuryV1,
      CHAIN_CONFIG.ethereum.treasuryV2,
      CHAIN_CONFIG.ethereum.treasuryMultisig,
    ],
    [CHAIN.BASE]: [CHAIN_CONFIG.base.treasury],
    [CHAIN.ARBITRUM]: [CHAIN_CONFIG.arbitrum.treasury],
  };
  return (config[chain] || []).map(a => a.toLowerCase());
}

/**
 * Fetch Cooler Loan interest using accumulator delta approach
 */
async function fetchCoolerLoanInterest(options: FetchOptions) {
  const { fromApi, toApi, createBalances } = options;
  const fees = createBalances();

  try {
    const monoCooler = CHAIN_CONFIG.ethereum.monoCooler;
    const [accBefore, accAfter, debtBefore, debtAfter] = await Promise.all([
      fromApi.call({ abi: ABIS.interestAccumulatorRay, target: monoCooler }),
      toApi.call({ abi: ABIS.interestAccumulatorRay, target: monoCooler }),
      fromApi.call({ abi: ABIS.totalDebt, target: monoCooler }),
      toApi.call({ abi: ABIS.totalDebt, target: monoCooler }),
    ]);

    const accDelta = BigInt(accAfter) - BigInt(accBefore);
    const avgDebt = (BigInt(debtBefore) + BigInt(debtAfter)) / BigInt(2);

    if (avgDebt > 0) {
      const interest = (avgDebt * accDelta) / RAY;
      fees.add(CHAIN_CONFIG.ethereum.usds, interest);
    }
  } catch (e) {}

  return fees;
}

/**
 * Fetch ERC-4626 yield for treasury holdings (sUSDS, sUSDe)
 * Uses fromApi for balance to avoid overcounting when yield is claimed and re-wrapped mid-period
 */
async function fetchERC4626Yield(
  options: FetchOptions,
  vaultAddress: string,
  underlyingToken: string,
  treasuryAddresses: string[]
) {
  const { fromApi, toApi, createBalances } = options;
  const fees = createBalances();

  try {
    const balances = await fromApi.multiCall({
      abi: ABIS.balanceOf,
      calls: treasuryAddresses.map(t => ({ target: vaultAddress, params: [t] })),
    });

    const totalBalance = balances.reduce((sum, bal) => sum + BigInt(bal), BigInt(0));
    if (totalBalance === BigInt(0)) return fees;

    const [oldRate, newRate] = await Promise.all([
      fromApi.call({ abi: ABIS.convertToAssets, target: vaultAddress, params: [ONE_SHARE.toString()] }),
      toApi.call({ abi: ABIS.convertToAssets, target: vaultAddress, params: [ONE_SHARE.toString()] }),
    ]);

    const rateDelta = BigInt(newRate) - BigInt(oldRate);
    const yieldAmount = (rateDelta * totalBalance) / ONE_SHARE;
    fees.add(underlyingToken, yieldAmount);
  } catch (e) {}

  return fees;
}

/**
 * Fetch CD Facility revenue - tracks sUSDS yield harvested to treasury
 */
async function fetchCDFacilityRevenue(options: FetchOptions) {
  const fees = options.createBalances();

  try {
    const logs = await options.getLogs({
      target: CHAIN_CONFIG.ethereum.cdFacility,
      eventAbi: EVENTS.cdClaimedYield,
    });

    for (const log of logs) {
      fees.add(log.asset, log.actualYield);
    }
  } catch (e) {
    // CD Facility may not have events in all periods
  }

  return fees;
}

/**
 * Fetch CD Lending interest from loan repayments
 */
async function fetchCDLendingRevenue(options: FetchOptions) {
  const fees = options.createBalances();

  try {
    const logs = await options.getLogs({
      target: CHAIN_CONFIG.ethereum.cdLending,
      eventAbi: EVENTS.cdLendingRepaid,
    });

    for (const log of logs) {
      fees.add(CHAIN_CONFIG.ethereum.usds, BigInt(log.interest));
    }
  } catch (e) {}

  return fees;
}

/**
 * Fetch Uniswap V3 POL fees (Ethereum and Base)
 *
 * Collect events include both accrued fees AND principal returned from
 * DecreaseLiquidity (rebalances / withdrawals). To isolate pure fee revenue
 * we subtract per-token DecreaseLiquidity amounts from Collect amounts for
 * each position in the same period.
 */
async function fetchUniV3POLFees(
  options: FetchOptions,
  positionManager: string,
  treasuryAddresses: string[],
  positionIds?: number[]
) {
  const fees = options.createBalances();

  try {
    const [collectLogs, decreaseLogs] = await Promise.all([
      options.getLogs({ target: positionManager, eventAbi: EVENTS.uniV3Collect }),
      options.getLogs({ target: positionManager, eventAbi: EVENTS.uniV3DecreaseLiquidity }),
    ]);

    const positionIdSet = positionIds ? new Set(positionIds.map(String)) : null;
    const treasuryCollects = collectLogs.filter((log: any) =>
      treasuryAddresses.includes(log.recipient.toLowerCase()) &&
      (!positionIdSet || positionIdSet.has(String(log.tokenId)))
    );

    // Aggregate DecreaseLiquidity amounts per tokenId so we can subtract
    // returned principal from the corresponding Collect amounts.
    const decreasedAmounts = new Map<string, { amount0: bigint; amount1: bigint }>();
    for (const log of decreaseLogs) {
      const id = String(log.tokenId);
      if (positionIdSet && !positionIdSet.has(id)) continue;
      const prev = decreasedAmounts.get(id) || { amount0: BigInt(0), amount1: BigInt(0) };
      prev.amount0 += BigInt(log.amount0);
      prev.amount1 += BigInt(log.amount1);
      decreasedAmounts.set(id, prev);
    }

    // Aggregate Collect amounts per tokenId
    const collectedAmounts = new Map<string, { amount0: bigint; amount1: bigint }>();
    for (const log of treasuryCollects) {
      const id = String(log.tokenId);
      const prev = collectedAmounts.get(id) || { amount0: BigInt(0), amount1: BigInt(0) };
      prev.amount0 += BigInt(log.amount0);
      prev.amount1 += BigInt(log.amount1);
      collectedAmounts.set(id, prev);
    }

    // Look up token addresses for each position
    const uniqueTokenIds: string[] = [];
    collectedAmounts.forEach((_, id) => uniqueTokenIds.push(id));
    const positionCache = new Map<string, { token0: string; token1: string }>();

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
      } catch (e) {}
    }

    // Fee = Collected - Decreased (floor at 0)
    collectedAmounts.forEach((collected, id) => {
      const positionData = positionCache.get(id);
      if (!positionData) return;

      const decreased = decreasedAmounts.get(id) || { amount0: BigInt(0), amount1: BigInt(0) };
      const fee0 = collected.amount0 - decreased.amount0;
      const fee1 = collected.amount1 - decreased.amount1;

      if (fee0 > BigInt(0)) fees.add(positionData.token0, fee0);
      if (fee1 > BigInt(0)) fees.add(positionData.token1, fee1);
    });
  } catch (e) {}

  return fees;
}

/**
 * Fetch Camelot V2 POL fees on Arbitrum
 * 
 * ASSUMPTION: Olympus owns ~100% of LP in this pool (validated Jan 2026).
 * If third-party LPs join, this calculation would overstate Olympus's share.
 */
async function fetchCamelotV2Fees(options: FetchOptions) {
  const fees = options.createBalances();

  try {
    const swapLogs = await options.getLogs({
      target: CHAIN_CONFIG.arbitrum.camelotV2Pool,
      eventAbi: EVENTS.camelotV2Swap,
    });

    const FEE_RATE = BigInt(25); // 0.25% LP share (25 bps)
    const BPS = BigInt(10000);

    for (const log of swapLogs) {
      const amount0In = BigInt(log.amount0In);
      const amount1In = BigInt(log.amount1In);

      if (amount0In > 0) {
        fees.add(CHAIN_CONFIG.arbitrum.weth, (amount0In * FEE_RATE) / BPS);
      }
      if (amount1In > 0) {
        fees.add(CHAIN_CONFIG.arbitrum.ohm, (amount1In * FEE_RATE) / BPS);
      }
    }
  } catch (e) {}

  return fees;
}

async function fetchEthereum(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const treasuryAddresses = getTreasuryAddresses(CHAIN.ETHEREUM);

  const [coolerInterest, susdsYield, susdeYield, cdFacilityRevenue, cdLendingRevenue, polFees] = await Promise.all([
    fetchCoolerLoanInterest(options),
    fetchERC4626Yield(
      options,
      CHAIN_CONFIG.ethereum.sUSDS,
      CHAIN_CONFIG.ethereum.usds,
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

  dailyFees.addBalances(coolerInterest);
  dailyFees.addBalances(susdeYield);
  dailyFees.addBalances(cdLendingRevenue);
  dailyFees.addBalances(polFees);

  // Handle sUSDS yield and CD Facility revenue to avoid double counting.
  // CD Facility holds sUSDS internally; when yield is claimed via ClaimedYield events,
  // it transfers to treasury as USDS. Subtract CD-claimed USDS from sUSDS yield calculation.
  const usdsAddressKey = `ethereum:${CHAIN_CONFIG.ethereum.usds.toLowerCase()}`;
  const cdBalances = cdFacilityRevenue.getBalances();
  const cdClaimedUsds = BigInt(cdBalances[usdsAddressKey] || 0);

  if (cdClaimedUsds > BigInt(0)) {
    const susdsBalances = susdsYield.getBalances();
    const susdsUsdsYield = BigInt(susdsBalances[usdsAddressKey] || 0);
    const netSusdsYield = susdsUsdsYield - cdClaimedUsds;
    dailyFees.add(CHAIN_CONFIG.ethereum.usds, netSusdsYield);
    dailyFees.addBalances(cdFacilityRevenue);
  } else {
    dailyFees.addBalances(susdsYield);
    dailyFees.addBalances(cdFacilityRevenue);
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

async function fetchBase(options: FetchOptions) {
  const treasuryAddresses = getTreasuryAddresses(CHAIN.BASE);
  const dailyFees = await fetchUniV3POLFees(
    options,
    CHAIN_CONFIG.base.uniV3PositionManager,
    treasuryAddresses,
    CHAIN_CONFIG.base.positionIds
  );

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

async function fetchArbitrum(options: FetchOptions) {
  const dailyFees = await fetchCamelotV2Fees(options);
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const methodology = {
  Fees: "Total revenue from all protocol sources: Cooler Loan interest, sUSDS/sUSDe treasury yield, CD Facility yield, CD Lending interest, and POL (Protocol-Owned Liquidity) fees across all chains",
  Revenue: "Sum of all protocol revenue streams - as a reserve currency protocol, all revenue strengthens the treasury backing OHM",
  ProtocolRevenue: "100% of revenue flows to protocol treasury, funding YRF buybacks that increase backing per OHM. Holder value accrual via improved Cooler Loan LTV will be tracked in a separate Lending adapter.",
};

const adapter: SimpleAdapter = {
  version: 2,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchEthereum, start: "2023-01-01" },
    [CHAIN.BASE]: { fetch: fetchBase, start: "2024-01-01" },
    [CHAIN.ARBITRUM]: { fetch: fetchArbitrum, start: "2024-01-01" },
  },
  methodology,
};

export default adapter;
