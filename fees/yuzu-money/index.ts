import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Yuzu Money is an over-collateralised yield protocol with two products:
//
//   - Yuzu Alpha (Plasma chain): users hold the yzUSD stablecoin and stake it
//     into syzUSD or supply the yzPP first-loss tranche.
//   - Yuzu Prime  (Monad chain):  yzPrime token, continuous yield distribution.
//
// Per the protocol's own docs (yuzu-money.gitbook.io/yuzu-money/faq/performance-fee):
// "Does Yuzu Money charge a performance fee on the generated yield? ... Yuzu
//  Money takes a fixed-fee approach: no performance fee, and dynamically
//  adjusted APY distribution to depositors..." — i.e. 100% of yield realised
//  by underlying strategies is distributed back to depositors via the
//  ERC-4626 share-rate of syzUSD / yzPP / yzPrime; the protocol's economic
//  accrual is via the Reserve Fund (yzUSD/USDT0 wallet 0xdaef005a...), which
//  is a *long-horizon* surplus/deficit buffer rather than a per-day fee skim.
//
// This adapter reports the on-chain depositor yield (which equals total
// distributed protocol yield, since no performance fee is taken) by reading
// each ERC-4626 vault's total_assets / total_supply at the window endpoints
// and converting the share-rate delta back to underlying units.

interface VaultConfig {
  /** ERC-4626 vault token address. */
  vault: string;
  /** Underlying `asset()` of the vault (yzUSD for syzUSD, USDT0 for yzPP, etc.). */
  underlying: string;
  /** Human-readable label used for breakdownMethodology / logging. */
  label: string;
}

const PLASMA_USDT0 = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb";
const PLASMA_YZUSD = "0x6695c0f8706c5ace3bdf8995073179cca47926dc";
const MONAD_USD = "0x754704bc059f8c67012fed69bc8a327a5aafb603"; // yzPrime asset()

const chainConfig: Record<string, { start: string, vaults: VaultConfig[] }> = {
  [CHAIN.PLASMA]: {
    start: "2025-08-01",
    vaults: [
    {
      vault: "0xc8a8df9b210243c55d31c73090f06787ad0a1bf6", // syzUSD
      underlying: PLASMA_YZUSD,
      label: "syzUSD Staking Yield To Stakers",
    },
    {
      vault: "0xebfc8c2fe73c431ef2a371aea9132110aab50dca", // yzPP
      underlying: PLASMA_USDT0,
      label: "yzPP First-Loss Tranche Yield To Holders",
    },
  ]},
  [CHAIN.MONAD]: {
    start: "2026-05-01",
    vaults: [
    {
      vault: "0xc9ea90692757831d98ac629f2a0140e02b80a7da", // yzPrime
      underlying: MONAD_USD,
      label: "yzPrime Yield To Holders",
    },
  ]},
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults = chainConfig[options.chain].vaults;

  const vaultAddresses = vaults.map((v) => v.vault);
  const totalAssetsAbi = "uint256:totalAssets";
  const totalSupplyAbi = "uint256:totalSupply";

  const [assetsFrom, supplyFrom, assetsTo, supplyTo] = await Promise.all([
    options.fromApi.multiCall({ abi: totalAssetsAbi, calls: vaultAddresses }),
    options.fromApi.multiCall({ abi: totalSupplyAbi, calls: vaultAddresses }),
    options.toApi.multiCall({ abi: totalAssetsAbi, calls: vaultAddresses }),
    options.toApi.multiCall({ abi: totalSupplyAbi, calls: vaultAddresses }),
  ]);

  vaults.forEach((v, i) => {
    const aFrom = Number(assetsFrom[i]);
    const sFrom = Number(supplyFrom[i]);
    const aTo = Number(assetsTo[i]);
    const sTo = Number(supplyTo[i]);

    // Skip days where the vault hadn't deployed / has no shares yet — share-rate
    // is undefined in that regime and forwarding the delta would emit NaN.
    if (!sFrom || !sTo) return;

    // Share-rate is (totalAssets / totalSupply); the underlying yield delivered
    // to depositors over the window is the rate growth scaled by today's share
    // supply, which gives the result in underlying-asset native units.
    const rateFrom = aFrom / sFrom;
    const rateTo = aTo / sTo;
    const yieldUnderlying = (rateTo - rateFrom) * sTo;

    // No fee skim — all on-chain yield accrues to depositors via vault
    // appreciation, so dailyFees == dailySupplySideRevenue per the docs.
    dailyFees.add(v.underlying, yieldUnderlying, v.label);
    dailySupplySideRevenue.add(v.underlying, yieldUnderlying, v.label);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Yield realised by Yuzu Money's underlying strategies and distributed to depositors via syzUSD / yzPP / yzPrime ERC-4626 share-rate appreciation.",
  UserFees: "Yield earned on user deposits in syzUSD / yzPP / yzPrime.",
  Revenue:
    "Zero by policy. Per Yuzu Money's docs the protocol takes no performance fee on yield; its economic accrual is via the off-chain Reserve Fund surplus/deficit buffer, which is not modelled here.",
  ProtocolRevenue: "Zero by policy (see Revenue).",
  SupplySideRevenue:
    "Full vault yield distributed to syzUSD / yzPP / yzPrime depositors via share-rate appreciation.",
};

const breakdownMethodology = {
  Fees: {
    "syzUSD Staking Yield To Stakers":
      "Daily growth of syzUSD's totalAssets/totalSupply ratio multiplied by today's supply, in yzUSD units.",
    "yzPP First-Loss Tranche Yield To Holders":
      "Daily growth of yzPP's totalAssets/totalSupply ratio multiplied by today's supply, in USDT0 units. yzPP earns a base yield tracking syzUSD plus a protocol-funded bonus budget from the Reserve Fund.",
    "yzPrime Yield To Holders":
      "Daily growth of yzPrime's totalAssets/totalSupply ratio multiplied by today's supply. yzPrime is the Yuzu Prime product on Monad with continuous yield distribution.",
  },
  SupplySideRevenue: {
    "syzUSD Staking Yield To Stakers":
      "yzUSD stakers receive 100% of the underlying strategy yield via syzUSD share-rate appreciation.",
    "yzPP First-Loss Tranche Yield To Holders":
      "yzPP holders receive base yield plus a protocol-funded bonus, in exchange for accepting first-loss risk.",
    "yzPrime Yield To Holders":
      "yzPrime holders receive the full Yuzu Prime yield via share-rate appreciation.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  // First-loss yzPP can absorb negative NAV days when realised strategy P&L
  // outruns the Reserve Fund's coverage budget — the docs explicitly call out
  // this risk. Allow the signed value through rather than masking it.
  allowNegativeValue: true,
};

export default adapter;
