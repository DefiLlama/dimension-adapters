import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

/**
 * OpenTrade - Tokenized Money Market Fund & Bond Vaults
 *
 * Fee Structure (from docs):
 * - Advisor Fee: 0.10% - covers advising OpenTrade SPC on portfolio management
 * - Platform Fee: 0.20% - covers development and maintenance of the platform
 * - Liquidity Fee: 0.20% - covers providing liquidity for immediate interest payments
 * - Total: 0.50% per annum, applied to total collateral value (not just yield)
 *
 * Fees are calculated daily: Collateral Value * (0.50% / 252 trading days)
 * Deducted from exchange rate rather than paid directly by lenders.
 */

const TOTAL_FEE_BPS = 50; // 0.50% = 50 bps
const BPS_DENOMINATOR = 10000;
const TRADING_DAYS_PER_YEAR = 252;

// Underlying assets per chain
const USDC: Record<string, string> = {
  [CHAIN.AVAX]: ADDRESSES.avax.USDC,
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.USDC,
  [CHAIN.PLUME]: "0x3938A812c54304fEffD266C7E2E70B48F9475aD6", // USDC on Plume
};

const EURC: Record<string, string> = {
  [CHAIN.AVAX]: "0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD", // EURC on Avalanche
  [CHAIN.ETHEREUM]: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c", // EURC on Ethereum
};

const USDT: Record<string, string> = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.USDT,
};

interface VaultConfig {
  address: string;
  asset: string;
  name: string;
}

const config: Record<string, VaultConfig[]> = {
  [CHAIN.AVAX]: [
    {
      address: "0x09Ca60Ca323a6313aE144778c3EbDfCCFBB5e5D2", //04/14/2025
      asset: USDC[CHAIN.AVAX],
      name: "XMMF",
    },
    {
      address: "0x061329361E0f163125225bf71a1E5AF954b46869", //04/07/2025
      asset: USDC[CHAIN.AVAX],
      name: "XFTB",
    },
    {
      address: "0xad6605F4987031fd2d6d6816bE53Eb7C5b764bf7", //09/02/2024
      asset: USDC[CHAIN.AVAX],
      name: "XTBT",
    },
    {
      address: "0xBFdEf5e389bB403426337081eCD1D05bC5193203", //02/04/2025
      asset: EURC[CHAIN.AVAX],
      name: "XEVT",
    },
    {
      address: "0x1D7E71d0CB499C31349DF3E9205A4b16bcCF2536", //03/31/2025
      asset: USDC[CHAIN.AVAX],
      name: "XHYC",
    },
    {
      address: "0xbb9360d57f68075e98d022784c12f2fda082316b", //09/20/2024
      asset: USDC[CHAIN.AVAX],
      name: "XRV1",
    },
  ],
  [CHAIN.ETHEREUM]: [
    {
      address: "0x0f8CbdC544dC1D4Bd1bDafE0039Be07B825aF82A", //02/29/2024
      asset: USDC[CHAIN.ETHEREUM],
      name: "XTBT",
    },
    {
      address: "0x3Ee320c9F73a84D1717557af00695A34b26d1F1d", //04/25/2024
      asset: EURC[CHAIN.ETHEREUM],
      name: "XEVT",
    },
    {
      address: "0x1e571c87556F216662fa8D25143b1b0618512Ef6", //05/09/2025
      asset: USDC[CHAIN.ETHEREUM],
      name: "XMMF",
    },
    {
      address: "0xD06f235DF80D4981816F7fB0936973155CDe1f4C", //05/15/2025
      asset: USDT[CHAIN.ETHEREUM],
      name: "XMMF-USDT",
    },
    {
      address: "0x0bbc2be1333575f00ed9db96f013a31fdb12a5eb", //12/08/2023
      asset: USDC[CHAIN.ETHEREUM],
      name: "TBV1",
    },
    {
      address: "0x30c3115dca6370c185d5d06407f29d3ddbc4cfc4", //12/08/2023
      asset: USDC[CHAIN.ETHEREUM],
      name: "TBV2",
    },
    {
      address: "0x7bfb97fe849172608895fd4c62237cb42a8607d2", //12/08/2023
      asset: USDC[CHAIN.ETHEREUM],
      name: "TBV3",
    },
    {
      address: "0xa65446265517a29f7427abb1279165eb61624dd0", //12/08/2023
      asset: USDC[CHAIN.ETHEREUM],
      name: "TBV4",
    },
  ],
  [CHAIN.PLUME]: [
    {
      address: "0x6688aA2eB549e325C21a16c942827C9c99F40dd9", //05/15/2025
      asset: USDC[CHAIN.PLUME],
      name: "XMMF",
    },
    {
      address: "0xf19d819F23b05C231C0de1dde97289476A0Bcf30", //06/12/2025
      asset: USDC[CHAIN.PLUME],
      name: "XHYCB",
    },
  ],
};

const abis = {
  exchangeRate: "uint256:exchangeRate",
  totalSupply: "uint256:totalSupply",
  totalAssets: "uint256:totalAssets",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults = config[options.chain];
  const vaultAddresses = vaults.map((v) => v.address);

  // Calculate period as fraction of year (using 252 trading days)
  const periodInDays =
    (options.toTimestamp - options.fromTimestamp) / (24 * 60 * 60);
  const periodFraction = periodInDays / TRADING_DAYS_PER_YEAR;

  const [totalAssets, totalSupplies, ratesBefore, ratesAfter] =
    await Promise.all([
      options.api.multiCall({
        abi: abis.totalAssets,
        calls: vaultAddresses,
        permitFailure: true,
      }),
      options.api.multiCall({
        abi: abis.totalSupply,
        calls: vaultAddresses,
        permitFailure: true,
      }),
      options.fromApi.multiCall({
        abi: abis.exchangeRate,
        calls: vaultAddresses,
        permitFailure: true,
      }),
      options.toApi.multiCall({
        abi: abis.exchangeRate,
        calls: vaultAddresses,
        permitFailure: true,
      }),
    ]);

  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    const assets = totalAssets[i];
    const supply = totalSupplies[i];
    const rateBefore = ratesBefore[i];
    const rateAfter = ratesAfter[i];

    if (!assets || !supply || !rateBefore || !rateAfter) {
      continue;
    }

    // Management fee: 0.50% p.a. applied to total collateral value
    // Daily fee = Total Assets * (0.50% / 252)
    const managementFee =
      Number(assets) * (TOTAL_FEE_BPS / BPS_DENOMINATOR) * periodFraction;

    // Net yield distributed to depositors (after fees already deducted from exchange rate)
    const rateDelta = Number(rateAfter) - Number(rateBefore);
    const netYield = rateDelta > 0 ? (rateDelta * Number(supply)) / 1e18 : 0;

    // Total fees = management fees (applied to total collateral)
    dailyFees.add(vault.asset, managementFee, METRIC.MANAGEMENT_FEES);
    dailyRevenue.add(vault.asset, managementFee, METRIC.MANAGEMENT_FEES);

    // Yields distributed to depositors
    if (netYield > 0) {
      dailyFees.add(vault.asset, netYield, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(vault.asset, netYield, METRIC.ASSETS_YIELDS);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Includes yields on all vaults and management fees (0.50% p.a. on total collateral).",
  Revenue:
    "Management fees (0.50% p.a.): Advisor 0.10% + Platform 0.20% + Liquidity 0.20%, applied to total collateral value.",
  ProtocolRevenue:
    "Same as Revenue - management fees collected by OpenTrade protocol.",
  SupplySideRevenue:
    "Net yield distributed to vault depositors after protocol fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Yields on vaults distributed to depositors.",
    [METRIC.MANAGEMENT_FEES]:
      "Management fees (0.50% p.a.) applied to total collateral value.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]:
      "Management fees (0.50% p.a.) applied to total collateral value.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yields on vaults distributed to depositors.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Management fees going to protocol treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: "2024-09-02",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-08-12",
    },
    [CHAIN.PLUME]: {
      fetch,
      start: "2025-05-15",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
