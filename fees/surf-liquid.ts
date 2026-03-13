import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const V2_FACTORY = "0x1D283b668F947E03E8ac8ce8DA5505020434ea0E";
const V3_FACTORY = "0xf1d64dee9f8e109362309a4bfbb523c8e54fa1aa";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const ASSETS = [USDC, WETH, CBBTC];
const ZERO = "0x0000000000000000000000000000000000000000";

const V3_VAULT_DEPLOYED =
  "0x30f7c1411599514d4a6ee3d132cced214b34bbe4c49d77f74391224dc6d8d635";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const api = options.api;
  const fromApi = options.fromApi;

  // --- Discover vault addresses ---

  // V2 vaults from factory
  const totalV2 = await api.call({ abi: "uint256:getTotalVaults", target: V2_FACTORY });
  const v2Infos = await api.multiCall({
    abi: "function getVaultInfo(uint256) view returns (address, address, address, uint256, bytes32, uint256)",
    calls: [...Array(Number(totalV2)).keys()].map((i: number) => ({
      target: V2_FACTORY,
      params: [i],
    })),
  });
  const v2Vaults: string[] = v2Infos.map((info: any) => info[0]);

  // V3 vaults from factory events
  const v3DeployLogs = await options.getLogs({
    target: V3_FACTORY,
    topics: [V3_VAULT_DEPLOYED],
    fromBlock: 38856207,
    cacheInCloud: true,
  });
  const v3Vaults: string[] = v3DeployLogs.map(
    (l: any) => "0x" + l.topics[1].slice(26)
  );

  // --- Get current Morpho vaults and balances ---

  // Build list of (surfVault, morphoVault, asset) tuples
  type Allocation = { surfVault: string; morphoVault: string; asset: string };
  const allocations: Allocation[] = [];

  // V2 vaults -> currentVault() (USDC only)
  const v2Morpho = await api.multiCall({
    abi: "address:currentVault",
    calls: v2Vaults.map((target: string) => ({ target })),
  });
  for (let i = 0; i < v2Vaults.length; i++) {
    if (v2Morpho[i] && v2Morpho[i] !== ZERO) {
      allocations.push({ surfVault: v2Vaults[i], morphoVault: v2Morpho[i], asset: USDC });
    }
  }

  // V3 vaults -> assetToVault(asset) for each asset
  if (v3Vaults.length > 0) {
    const morphoVaultsByAsset = await Promise.all(
      ASSETS.map((asset) =>
        api.multiCall({
          abi: "function assetToVault(address) view returns (address)",
          calls: v3Vaults.map((vault: string) => ({ target: vault, params: [asset] })),
        })
      )
    );
    for (let assetId = 0; assetId < ASSETS.length; assetId++) {
      const asset = ASSETS[assetId];
      const morphoVaults = morphoVaultsByAsset[assetId];
      for (let i = 0; i < v3Vaults.length; i++) {
        if (morphoVaults[i] && morphoVaults[i] !== ZERO) {
          allocations.push({ surfVault: v3Vaults[i], morphoVault: morphoVaults[i], asset });
        }
      }
    }
  }

  // --- Get Morpho vault share prices at start and end of period ---

  const uniqueMorphoVaults = [...new Set(allocations.map((a) => a.morphoVault))];

  // Start and End of period: totalAssets and totalSupply
  const [startAssets, startSupply, endAssets, endSupply] = await Promise.all([
    fromApi.multiCall({
      abi: "uint256:totalAssets",
      calls: uniqueMorphoVaults.map((target: string) => ({ target })),
    }),
    fromApi.multiCall({
      abi: "uint256:totalSupply",
      calls: uniqueMorphoVaults.map((target: string) => ({ target })),
    }),
    api.multiCall({
      abi: "uint256:totalAssets",
      calls: uniqueMorphoVaults.map((target: string) => ({ target })),
    }),
    api.multiCall({
      abi: "uint256:totalSupply",
      calls: uniqueMorphoVaults.map((target: string) => ({ target })),
    }),
  ]);

  const morphoVaultIndex = new Map(uniqueMorphoVaults.map((v, i) => [v, i]));

  // --- Get Surf vault balances (shares held) at end of period ---

  const balances = await api.multiCall({
    abi: "function balanceOf(address) view returns (uint256)",
    calls: allocations.map((a) => ({
      target: a.morphoVault,
      params: [a.surfVault],
    })),
  });

  // --- Compute yield earned and fees ---

  for (let i = 0; i < allocations.length; i++) {
    const { morphoVault, asset } = allocations[i];
    const shares = BigInt(balances[i] || "0");
    if (shares === 0n) continue;

    const idx = morphoVaultIndex.get(morphoVault)!;
    const endSupplyBig = BigInt(endSupply[idx] ?? "0");
    const endAssetsValue = endSupplyBig > 0n
      ? (shares * BigInt(endAssets[idx] ?? "0")) / endSupplyBig
      : 0n;
    const startSupplyBig = BigInt(startSupply[idx] ?? "0");
    const startAssetsValue = startSupplyBig > 0n
      ? (shares * BigInt(startAssets[idx] ?? "0")) / startSupplyBig
      : 0n;
    const yieldAmount = endAssetsValue > startAssetsValue ? endAssetsValue - startAssetsValue : 0n;

    if (yieldAmount <= 0n) continue;

    // 10% performance fee
    const feeAmount = yieldAmount / 10n;
    const supplySideAmount = yieldAmount - feeAmount;

    dailyFees.add(asset, yieldAmount);
    dailyRevenue.add(asset, feeAmount)
    dailySupplySideRevenue.add(asset, supplySideAmount);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-10-01",
  methodology: {
    Fees: "All the yield earned across all Morpho vault positions, calculated from share price changes.",
    Revenue: "10% performance fee on the yield.",
    ProtocolRevenue: "Protocol retains no revenue; all fees go to SURF buybacks.",
    HoldersRevenue: "All revenue is distributed to SURF holders via token buybacks.",
    SupplySideRevenue: "90% of earned yield is retained by vault depositors.",
  },
};

export default adapter;
