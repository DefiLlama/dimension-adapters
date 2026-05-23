import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// GLIF runs an on-chain credit market on Filecoin: Liquidity Providers deposit
// FIL into InfinityPoolV2, receive the iFIL share token, and earn the interest
// that Filecoin Storage Providers (SPs) pay to borrow FIL.
//
// Per the protocol docs the borrow rate is 15% APR
// (docs.glif.io/en/for-storage-providers/borrowing-cost). SP interest accrues
// continuously to iFIL holders through ERC-4626-style share-rate appreciation
// (docs.glif.io/en/for-liquidity-providers/glif-reward-mechanism-ifil), so the
// daily fee paid into the pool equals the day's growth in
// `convertToAssets(1e18)` multiplied by today's iFIL supply.
//
// Per GLIF's own indexer (events.glif.link/pool/0/fees) the treasury fee
// balance reads ~9,957 FIL today and has barely changed in months while the
// pool earned > 1.5M FIL of interest, so substantially all SP interest is
// distributed to iFIL holders. Protocol revenue is reported as zero.

const INFINITY_POOL_V2 = "0xe764Acf02D8B7c21d2B6A8f0a96C78541e0DC3fd";
const IFIL = "0x690908f7fa93afC040CFbD9fE1dDd2C2668Aa0e0";
const WFIL = "0x60E1773636CF5E4A227d9AC24F20fEca034ee25A";

const ONE_E18 = 10n ** 18n;

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const convertToAssetsAbi = "function convertToAssets(uint256 shares) view returns (uint256)";
  const totalSupplyAbi = "uint256:totalSupply";

  const [rateFromRaw, rateToRaw, supplyToRaw] = await Promise.all([
    options.fromApi.call({ abi: convertToAssetsAbi, target: INFINITY_POOL_V2, params: [ONE_E18.toString()] }),
    options.toApi.call({ abi: convertToAssetsAbi, target: INFINITY_POOL_V2, params: [ONE_E18.toString()] }),
    options.toApi.call({ abi: totalSupplyAbi, target: IFIL }),
  ]);

  const rateFrom = BigInt(rateFromRaw);
  const rateTo = BigInt(rateToRaw);
  const supplyTo = BigInt(supplyToRaw);

  if (supplyTo === 0n || rateTo <= rateFrom) {
    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  }

  const yieldFil = ((rateTo - rateFrom) * supplyTo) / ONE_E18;

  const label = "FIL SP Borrow Interest To iFIL Holders";
  dailyFees.add(WFIL, yieldFil.toString(), label);
  dailySupplySideRevenue.add(WFIL, yieldFil.toString(), label);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Interest paid by Filecoin Storage Providers to borrow FIL from the GLIF InfinityPoolV2, measured as the daily appreciation of the iFIL ERC-4626 share rate multiplied by today's iFIL supply.",
  UserFees: "Borrower interest paid into the pool.",
  Revenue:
    "Zero by policy. The GLIF treasury fee balance (events.glif.link/pool/0/fees) has barely changed in months while the pool earned > 1.5M FIL of interest, so substantially all SP interest accrues to iFIL holders rather than a protocol fee.",
  ProtocolRevenue: "Zero by policy (see Revenue).",
  SupplySideRevenue: "Borrower interest captured by LPs via iFIL share-rate appreciation.",
};

const breakdownMethodology = {
  Fees: {
    "FIL SP Borrow Interest To iFIL Holders":
      "Daily fee = (convertToAssets(1e18)_today - convertToAssets(1e18)_yesterday) * iFIL.totalSupply / 1e18.",
  },
  SupplySideRevenue: {
    "FIL SP Borrow Interest To iFIL Holders":
      "100% of FIL borrow interest accrues to iFIL holders via share-rate appreciation.",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.FILECOIN]: { fetch, start: "2024-04-01" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
