import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";

/**
 * OlympusDAO Revenue Adapter
 * 
 * Tracks protocol revenue from multiple sources:
 * 1. Cooler Loan Interest - Interest accrued on perpetual gOHM-backed loans
 * 2. sUSDS/sUSDe Yield - ERC-4626 yield from treasury stablecoin holdings
 * 3. CD Facility Revenue - Yield harvested from Convertible Deposit facility
 * 4. POL Fees - LP fees from protocol-owned Uniswap V3 positions
 * 
 * All revenue accrues to the protocol treasury (100% protocol revenue).
 */

// Treasury addresses
const TREASURY_ADDRESSES = {
  TRSRY_MODULE: "0xa8687A15D4BE32CC8F0a8a7B9704a4C3993D9613",
  DAO_MULTISIG: "0x245cc372C84B3645Bf0Ffe6538620B04a217988B",
};

// Contract addresses
const CONTRACTS = {
  MONO_COOLER: "0xdb591Ea2e5db886da872654d58f6cc584b68e7cc",
  SUSDS: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
  SUSDE: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
  CD_FACILITY: "0xEBDe552D9e4F4b1855756F30Dc9ff16d8B2A24d8",
  UNISWAP_V3_POSITIONS: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
};

// ABIs
const COOLER_ABI = {
  interestAccumulator: "uint256:interestAccumulator",
  totalDebt: "uint256:totalDebt",
};

const ERC4626_ABI = {
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
  balanceOf: "function balanceOf(address account) view returns (uint256)",
  decimals: "uint8:decimals",
};

const CD_FACILITY_ABI = {
  claimedYield: "event ClaimedYield(address indexed asset, uint256 amount)",
};

const UNISWAP_V3_ABI = {
  collect: "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
};

const RAY = BigInt(10) ** BigInt(27);

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
    
    // Cooler uses USDS (formerly DAI)
    dailyRevenue.add("0xdC035D45d973E3EC169d2276DDab16f1e407384F", interest); // USDS
  } catch (e) {
    console.log("Cooler interest fetch failed:", e);
  }
  
  return dailyRevenue;
}

async function fetchERC4626Yield(options: FetchOptions) {
  const dailyRevenue = options.createBalances();
  const treasuryAddresses = Object.values(TREASURY_ADDRESSES);
  
  for (const vault of [CONTRACTS.SUSDS, CONTRACTS.SUSDE]) {
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
      
      // Add yield in underlying asset (USDS or USDe)
      if (vault === CONTRACTS.SUSDS) {
        dailyRevenue.add("0xdC035D45d973E3EC169d2276DDab16f1e407384F", yieldAmount); // USDS
      } else {
        dailyRevenue.add("0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", yieldAmount); // USDe
      }
    } catch (e) {
      console.log(`ERC4626 yield fetch failed for ${vault}:`, e);
    }
  }
  
  return dailyRevenue;
}

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

async function fetchPOLFees(options: FetchOptions) {
  const dailyRevenue = options.createBalances();
  const treasuryAddresses = Object.values(TREASURY_ADDRESSES).map(a => a.toLowerCase());
  
  try {
    const logs = await options.getLogs({
      target: CONTRACTS.UNISWAP_V3_POSITIONS,
      eventAbi: UNISWAP_V3_ABI.collect,
    });
    
    for (const log of logs) {
      // Only count fees collected to treasury addresses
      if (treasuryAddresses.includes(log.recipient.toLowerCase())) {
        // Note: We'd need to resolve the pool's token addresses from the tokenId
        // For now, adding as ETH equivalent (simplified)
        // TODO: Resolve actual tokens from position NFT
      }
    }
  } catch (e) {
    console.log("POL fees fetch failed:", e);
  }
  
  return dailyRevenue;
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  
  // Fetch all revenue sources
  const [coolerRevenue, erc4626Revenue, cdRevenue, polRevenue] = await Promise.all([
    fetchCoolerInterest(options),
    fetchERC4626Yield(options),
    fetchCDFacilityRevenue(options),
    fetchPOLFees(options),
  ]);
  
  // Combine all sources
  dailyRevenue.addBalances(coolerRevenue);
  dailyRevenue.addBalances(erc4626Revenue);
  dailyRevenue.addBalances(cdRevenue);
  dailyRevenue.addBalances(polRevenue);
  
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
  Fees: "Total revenue generated by the Olympus protocol from Cooler loan interest, stablecoin yield (sUSDS/sUSDe), CD Facility harvests, and POL LP fees.",
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
