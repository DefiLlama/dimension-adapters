import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// GLIF runs on-chain credit pools for DePIN networks. Two pools are live:
//
//   1) Filecoin InfinityPoolV2 (0xe764...3fd). LPs deposit FIL, receive iFIL,
//      and earn interest from Filecoin Storage Providers who borrow FIL at a
//      fixed 15% APR (docs.glif.io/en/for-storage-providers/borrowing-cost).
//      Per docs.glif.io/en/for-liquidity-providers/glif-reward-mechanism-ifil
//      iFIL holders earn 90% of borrower interest as share-rate appreciation,
//      with the remaining 10% going to the GLIF protocol treasury.
//      Treasury accrual is observable on events.glif.link/pool/0/fees and
//      moves consistently with new SP interest payments.
//
//   2) Base PoolV2 (0xAeD7...8f3, an ERC-4626 vault for "Staked ICNT").
//      LPs deposit ICNT, the pool delegates it to Impossible Cloud Network
//      hardware operators via the ICNProtocol, and node rewards accrue back
//      to the pool. The on-chain `treasuryFee()` getter returns 0.1e18 = 10%
//      and the protocol skims that share of each reward claim before the LP
//      portion is restaked into `totalAssets()` (restakePercentage() == 100%).
//
// Both pools charge a 10% protocol fee. The observable on-chain quantity is
// the LP yield realised through share-rate growth, which is 90% of the gross
// fee. The adapter grosses lpYield up by 10/9 to recover total fees and
// records the 1/9 difference as dailyRevenue / dailyProtocolRevenue.

interface PoolConfig {
  /** ERC-4626 (or 4626-shaped) pool whose `convertToAssets(1e18)` returns the asset value of one share. */
  pool: string;
  /** Share token; for the Base pool this is the same address as `pool`. */
  shareToken: string;
  /** Underlying asset address recorded in the balances object. */
  underlying: string;
  /** Protocol fee skim (basis points, 10000 = 100%). Filecoin: ~0; Base: 10%. */
  treasuryFeeBps: number;
  /** Human-readable label for the breakdown. */
  label: string;
  /** Adapter start date (yyyy-mm-dd) when GLIF first generated fees on this chain. */
  start: string;
}

const FILECOIN_INFINITY_POOL_V2 = "0xe764Acf02D8B7c21d2B6A8f0a96C78541e0DC3fd";
const FILECOIN_IFIL = "0x690908f7fa93afC040CFbD9fE1dDd2C2668Aa0e0";
const FILECOIN_WFIL = "0x60E1773636CF5E4A227d9AC24F20fEca034ee25A";

const BASE_ICN_POOL = "0xAeD7C2eD7Bb84396AfCB55fF72c8F8E87FFb68f3";
const BASE_ICNT = "0xe0cd4cacddcbf4f36e845407ce53e87717b6601d";

const chainConfig: Record<string, PoolConfig> = {
  [CHAIN.FILECOIN]: {
    pool: FILECOIN_INFINITY_POOL_V2,
    shareToken: FILECOIN_IFIL,
    underlying: FILECOIN_WFIL,
    treasuryFeeBps: 1000,
    label: "FIL SP Borrow Interest To iFIL Holders",
    start: "2024-04-01",
  },
  [CHAIN.BASE]: {
    pool: BASE_ICN_POOL,
    shareToken: BASE_ICN_POOL,
    underlying: BASE_ICNT,
    treasuryFeeBps: 1000,
    label: "ICN Delegation Rewards To stICNT Holders",
    start: "2025-07-02",
  },
};

const ONE_E18 = 10n ** 18n;
const BPS = 10000n;

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const config = chainConfig[options.chain];
  if (!config) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  const convertToAssetsAbi = "function convertToAssets(uint256 shares) view returns (uint256)";
  const totalSupplyAbi = "uint256:totalSupply";

  const [rateFromRaw, rateToRaw, supplyToRaw] = await Promise.all([
    options.fromApi.call({ abi: convertToAssetsAbi, target: config.pool, params: [ONE_E18.toString()] }),
    options.toApi.call({ abi: convertToAssetsAbi, target: config.pool, params: [ONE_E18.toString()] }),
    options.toApi.call({ abi: totalSupplyAbi, target: config.shareToken }),
  ]);

  const rateFrom = BigInt(rateFromRaw);
  const rateTo = BigInt(rateToRaw);
  const supplyTo = BigInt(supplyToRaw);

  if (supplyTo === 0n || rateTo <= rateFrom) {
    return {
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }

  const lpYield = ((rateTo - rateFrom) * supplyTo) / ONE_E18;
  const treasuryFeeBps = BigInt(config.treasuryFeeBps);
  const protocolFee = treasuryFeeBps === 0n ? 0n : (lpYield * treasuryFeeBps) / (BPS - treasuryFeeBps);
  const totalFees = lpYield + protocolFee;

  dailyFees.add(config.underlying, totalFees.toString(), config.label);
  dailySupplySideRevenue.add(config.underlying, lpYield.toString(), config.label);
  if (protocolFee > 0n) {
    dailyRevenue.add(config.underlying, protocolFee.toString(), config.label);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Interest and delegation rewards paid into the GLIF lending pools by Filecoin Storage Providers (FIL borrow APR) and Impossible Cloud Network node operators (ICN delegation rewards). Computed each day as LP yield from share-rate appreciation of iFIL / stICNT, grossed up by the 10% protocol treasury fee.",
  UserFees: "Borrower / delegate fees flowing into the pools.",
  Revenue:
    "10% protocol fee on both pools. Filecoin: per docs.glif.io/en/for-liquidity-providers/glif-reward-mechanism-ifil iFIL holders earn 90% of SP borrow interest and the protocol treasury takes the remaining 10%, observable on events.glif.link/pool/0/fees. Base: on-chain PoolV2.treasuryFee() returns 0.1e18 = 10%, applied to each ICN node reward claim before LP rewards are restaked.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue:
    "LP yield realised through iFIL / stICNT share-rate appreciation. On Base PoolV2.restakePercentage() == 100% so the LP portion of each reward claim is restaked into the pool and lands on totalAssets() for the next convertToAssets query.",
};

const breakdownMethodology = {
  Fees: {
    "FIL SP Borrow Interest To iFIL Holders":
      "Filecoin SPs borrow FIL from InfinityPoolV2 at 15% APR. Daily fee = LP yield from iFIL share-rate appreciation grossed up by 10/9 to include the 10% treasury skim.",
    "ICN Delegation Rewards To stICNT Holders":
      "ICN node operators delegate hardware capacity; the pool claims rewards and takes a 10% treasury fee. Daily fee = LP yield from stICNT share-rate appreciation grossed up by 10/9 to include the treasury skim.",
  },
  Revenue: {
    "FIL SP Borrow Interest To iFIL Holders":
      "10% of SP borrow interest goes to the GLIF protocol treasury (events.glif.link/pool/0/fees).",
    "ICN Delegation Rewards To stICNT Holders":
      "10% of ICN node rewards goes to the protocol treasury (PoolV2.treasuryFee() == 0.1e18).",
  },
  SupplySideRevenue: {
    "FIL SP Borrow Interest To iFIL Holders":
      "90% of SP borrow interest accrues to iFIL holders via share-rate appreciation.",
    "ICN Delegation Rewards To stICNT Holders":
      "90% of ICN delegation rewards accrue to stICNT holders via share-rate appreciation; 100% restake means the LP portion stays in the pool.",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.FILECOIN]: { fetch, start: chainConfig[CHAIN.FILECOIN].start },
    [CHAIN.BASE]: { fetch, start: chainConfig[CHAIN.BASE].start },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
