import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";

/**
 * OlympusDAO Revenue Adapter
 * 
 * Tracks protocol revenue from multiple sources on Ethereum mainnet.
 * All revenue accrues to the protocol treasury (100% protocol revenue).
 * 
 * Revenue Sources:
 * 1. Cooler Loan Interest - Interest accrued on perpetual gOHM-backed loans
 * 2. sUSDS Yield - ERC-4626 yield from treasury sUSDS holdings
 * 3. sUSDe Yield - ERC-4626 yield from treasury sUSDe holdings  
 * 4. CD Facility Revenue - Yield harvested from Convertible Deposit facility
 * 
 * Note: POL (Protocol-Owned Liquidity) fees from Uniswap V3 positions are not
 * yet included. These represent a smaller portion of revenue and will be added
 * in a future update.
 * 
 * @see https://docs.olympusdao.finance/
 */

// Token addresses
const TOKENS = {
  USDS: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
  USDE: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
};

// Treasury addresses
const TREASURY_ADDRESSES = {
  /** Olympus TRSRY module - primary treasury */
  TRSRY_MODULE: "0xa8687A15D4BE32CC8F0a8a7B9704a4C3993D9613",
  /** DAO Multisig - governance controlled treasury */
  DAO_MULTISIG: "0x245cc372C84B3645Bf0Ffe6538620B04a217988B",
};

// Contract addresses
const CONTRACTS = {
  /** MonoCooler - Cooler v2 lending contract */
  MONO_COOLER: "0xdb591Ea2e5db886da872654d58f6cc584b68e7cc",
  /** sUSDS - Sky savings USDS vault */
  SUSDS: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
  /** sUSDe - Ethena staked USDe vault */
  SUSDE: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
  /** Convertible Deposit Facility */
  CD_FACILITY: "0xEBDe552D9e4F4b1855756F30Dc9ff16d8B2A24d8",
};

// ABIs
const COOLER_ABI = {
  interestAccumulator: "uint256:interestAccumulator",
  totalDebt: "uint256:totalDebt",
};

const ERC4626_ABI = {
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
  balanceOf: "function balanceOf(address account) view returns (uint256)",
};

const CD_FACILITY_ABI = {
  claimedYield: "event ClaimedYield(address indexed asset, uint256 amount)",
};

const RAY = BigInt(10) ** BigInt(27);

/**
 * Fetches Cooler loan interest revenue.
 * 
 * Calculates interest accrued on all outstanding Cooler loans using the
 * accumulator delta method: interest = avgDebt × (accumEnd - accumStart) / RAY
 * 
 * @param options - Fetch options containing API references for start/end blocks
 * @returns Balances object with accrued interest in USDS
 */
async function fetchCoolerInterest(options: FetchOptions) {
  const dailyRevenue = options.createBalances();
  
  try {
    // Get accumulator and debt at start and end of period
    const [accumStart, accumEnd, debtStart, debtEnd] = await Promise.all([
      options.fromApi.call({ target: CONTRACTS.MONO_COOLER, abi: COOLER_ABI.interestAccumulator }),
      options.toApi.call({ target: CONTRACTS.MONO_COOLER, abi: COOLER_ABI.interestAccumulator }),
      options.fromApi.call({ target: CONTRACTS.MONO_COOLER, abi: COOLER_ABI.totalDebt }),
      options.toApi.call({ target: CONTRACTS.MONO_COOLER, abi: COOLER_ABI.totalDebt }),
    ]);
    
    // Calculate interest accrued: avgDebt × (accumEnd - accumStart) / RAY
    const avgDebt = (BigInt(debtStart) + BigInt(debtEnd)) / BigInt(2);
    const accumDelta = BigInt(accumEnd) - BigInt(accumStart);
    const interest = (avgDebt * accumDelta) / RAY;
    
    // Cooler loans are denominated in USDS
    dailyRevenue.add(TOKENS.USDS, interest);
  } catch (e) {
    console.log("Cooler interest fetch failed:", e);
  }
  
  return dailyRevenue;
}

/**
 * Fetches ERC-4626 yield from treasury stablecoin holdings.
 * 
 * Calculates yield by measuring the change in share-to-asset conversion rate
 * over the period and applying it to treasury balances at START of period.
 * Using START balance avoids overstatement from mid-period deposits.
 * 
 * Tracks yield from:
 * - sUSDS (Sky savings USDS)
 * - sUSDe (Ethena staked USDe)
 * 
 * @param options - Fetch options containing API references for start/end blocks
 * @returns Balances object with accrued yield in underlying tokens
 */
async function fetchERC4626Yield(options: FetchOptions) {
  const dailyRevenue = options.createBalances();
  const treasuryAddresses = Object.values(TREASURY_ADDRESSES);
  
  const vaultConfigs = [
    { vault: CONTRACTS.SUSDS, underlying: TOKENS.USDS },
    { vault: CONTRACTS.SUSDE, underlying: TOKENS.USDE },
  ];
  
  for (const { vault, underlying } of vaultConfigs) {
    try {
      // Get conversion rate at start and end (using 1e18 shares as reference)
      const oneShare = BigInt(10) ** BigInt(18);
      const [rateStart, rateEnd] = await Promise.all([
        options.fromApi.call({ target: vault, abi: ERC4626_ABI.convertToAssets, params: [oneShare.toString()] }),
        options.toApi.call({ target: vault, abi: ERC4626_ABI.convertToAssets, params: [oneShare.toString()] }),
      ]);
      
      // Get treasury balances at START of period (avoids overstatement from mid-period deposits)
      const balances = await options.fromApi.multiCall({
        abi: ERC4626_ABI.balanceOf,
        calls: treasuryAddresses.map(addr => ({ target: vault, params: [addr] })),
      });
      
      const totalBalance = balances.reduce((sum: bigint, bal: string) => sum + BigInt(bal || 0), BigInt(0));
      
      // Calculate yield: balance × (rateEnd - rateStart) / 1e18
      const rateDelta = BigInt(rateEnd) - BigInt(rateStart);
      const yieldAmount = (totalBalance * rateDelta) / oneShare;
      
      dailyRevenue.add(underlying, yieldAmount);
    } catch (e) {
      console.log(`ERC4626 yield fetch failed for ${vault}:`, e);
    }
  }
  
  return dailyRevenue;
}

/**
 * Fetches revenue from the Convertible Deposit (CD) Facility.
 * 
 * The CD Facility holds sUSDS and periodically harvests yield via ClaimedYield
 * events. This yield is separate from the direct treasury sUSDS holdings.
 * 
 * @param options - Fetch options containing log fetching utilities
 * @returns Balances object with claimed yield amounts
 */
async function fetchCDFacilityRevenue(options: FetchOptions) {
  const dailyRevenue = options.createBalances();
  
  try {
    const logs = await options.getLogs({
      target: CONTRACTS.CD_FACILITY,
      eventAbi: CD_FACILITY_ABI.claimedYield,
    });
    
    for (const log of logs) {
      dailyRevenue.add(log.asset, log.amount);
    }
  } catch (e) {
    console.log("CD Facility revenue fetch failed:", e);
  }
  
  return dailyRevenue;
}

/**
 * Main fetch function that aggregates all revenue sources.
 * 
 * Fetches revenue from:
 * - Cooler loan interest
 * - sUSDS/sUSDe ERC-4626 yield
 * - CD Facility harvests
 * 
 * All revenue is protocol revenue (no supply-side or holder distributions).
 * 
 * @param options - Fetch options from DefiLlama adapter framework
 * @returns Revenue metrics for the period
 */
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  
  // Fetch all revenue sources concurrently
  const [coolerRevenue, erc4626Revenue, cdRevenue] = await Promise.all([
    fetchCoolerInterest(options),
    fetchERC4626Yield(options),
    fetchCDFacilityRevenue(options),
  ]);
  
  // Combine all sources
  dailyRevenue.addBalances(coolerRevenue);
  dailyRevenue.addBalances(erc4626Revenue);
  dailyRevenue.addBalances(cdRevenue);
  
  // For Olympus, fees = revenue (all accrues to protocol)
  dailyFees.addBalances(dailyRevenue);
  
  return {
    dailyFees,
    dailyUserFees: 0, // No fees charged to users
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: 0, // All revenue to protocol
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "Total revenue generated by the Olympus protocol from Cooler loan interest, stablecoin yield (sUSDS/sUSDe), and CD Facility harvests.",
  UserFees: "OlympusDAO charges no fees to users.",
  Revenue: "All fees collected accrue to the protocol treasury.",
  ProtocolRevenue: "100% of revenue goes to the Olympus treasury to back OHM.",
  SupplySideRevenue: "Not applicable - Olympus operates differently from typical DeFi protocols.",
  HoldersRevenue: "OHM holders benefit indirectly through increased backing per OHM.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-10-01", // Cooler v2 launch
    },
  },
  methodology,
};

export default adapter;
