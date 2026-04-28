import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// V2/V3 Base constants
const V2_FACTORY = "0x1D283b668F947E03E8ac8ce8DA5505020434ea0E";
const V3_FACTORY = "0xf1d64dee9f8e109362309a4bfbb523c8e54fa1aa";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const ASSETS = [USDC, WETH, CBBTC];
const ZERO = "0x0000000000000000000000000000000000000000";

const V3_VAULT_DEPLOYED =
  "0x30f7c1411599514d4a6ee3d132cced214b34bbe4c49d77f74391224dc6d8d635";

// V4 constants — same addresses on all chains
const V4_FACTORY = "0x8fa50DeA8DB10987D7d22ac092001c3613C18779";
const V4_VAULT_DEPLOYED =
  "0x974c8040a9cc92c8ee6c077423071c05007f5382617d4b92868938f33d3d197e";

// RebalanceFeeCollected(address indexed asset, uint256 profitAmount, uint256 feeAmount, uint256 newBaseAmount)
const REBALANCE_FEE_COLLECTED =
  "0xa96e8cd4545e1d2f0f6bc0877047d3a207236888264e7be5513e888779a85fe2";

// MerklTokensClaimed(address indexed token, uint256 totalAmount, uint256 feeAmount, uint256 userAmount)
const MERKL_TOKENS_CLAIMED =
  "0x6b93c712f8760f33773ec46c38ea20e57ef035bcd5b8a46488e317251744d39d";

const V4_FROM_BLOCKS: Record<string, number> = {
  base: 43800000,
  ethereum: 22200000,
  arbitrum: 445000000,
  polygon: 71000000,
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const api = options.api;
  const fromApi = options.fromApi;
  const chain = options.chain;

  // --- V2/V3 fees (Base only) — yield from Morpho share price changes ---

  if (chain === CHAIN.BASE) {
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

    type Allocation = { surfVault: string; morphoVault: string; asset: string };
    const allocations: Allocation[] = [];

    const v2Morpho = await api.multiCall({
      abi: "address:currentVault",
      calls: v2Vaults.map((target: string) => ({ target })),
    });
    for (let i = 0; i < v2Vaults.length; i++) {
      if (v2Morpho[i] && v2Morpho[i] !== ZERO) {
        allocations.push({ surfVault: v2Vaults[i], morphoVault: v2Morpho[i], asset: USDC });
      }
    }

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

    const uniqueMorphoVaults = [...new Set(allocations.map((a) => a.morphoVault))];

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

    const balances = await api.multiCall({
      abi: "function balanceOf(address) view returns (uint256)",
      calls: allocations.map((a) => ({
        target: a.morphoVault,
        params: [a.surfVault],
      })),
    });

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

      const feeAmount = yieldAmount / 10n;
      const supplySideAmount = yieldAmount - feeAmount;

      dailyFees.add(asset, yieldAmount);
      dailyRevenue.add(asset, feeAmount);
      dailySupplySideRevenue.add(asset, supplySideAmount);
    }
  }

  // --- V4 fees (all chains) — exact fees from RebalanceFeeCollected events ---

  const fromBlock = V4_FROM_BLOCKS[chain];
  if (fromBlock) {
    // Enumerate user vaults (all-time, cached)
    const v4DeployLogs = await options.getLogs({
      target: V4_FACTORY,
      topics: [V4_VAULT_DEPLOYED],
      fromBlock,
      cacheInCloud: true,
    });
    const userVaults: string[] = v4DeployLogs.map(
      (l: any) => "0x" + l.topics[1].slice(26)
    );

    // Query fee events from each user vault for the current period
    for (const vault of userVaults) {
      // RebalanceFeeCollected: profitAmount = total yield, feeAmount = 10% protocol fee
      const rebalanceLogs = await options.getLogs({
        target: vault,
        topics: [REBALANCE_FEE_COLLECTED],
      });
      for (const log of rebalanceLogs) {
        const asset = "0x" + log.topics[1].slice(26);
        const data = (log as any).data.slice(2);
        const profitAmount = BigInt("0x" + data.slice(0, 64));
        const feeAmount = BigInt("0x" + data.slice(64, 128));
        if (profitAmount <= 0n) continue;
        const supplySideAmount = profitAmount - feeAmount;
        dailyFees.add(asset, profitAmount);
        dailyRevenue.add(asset, feeAmount);
        dailySupplySideRevenue.add(asset, supplySideAmount);
      }

      // MerklTokensClaimed: totalAmount = rewards claimed, feeAmount = 10%, userAmount = 90%
      const merklLogs = await options.getLogs({
        target: vault,
        topics: [MERKL_TOKENS_CLAIMED],
      });
      for (const log of merklLogs) {
        const token = "0x" + log.topics[1].slice(26);
        const data = (log as any).data.slice(2);
        const totalAmount = BigInt("0x" + data.slice(0, 64));
        const feeAmount = BigInt("0x" + data.slice(64, 128));
        const userAmount = BigInt("0x" + data.slice(128, 192));
        if (totalAmount <= 0n) continue;
        dailyFees.add(token, totalAmount);
        dailyRevenue.add(token, feeAmount);
        dailySupplySideRevenue.add(token, userAmount);
      }
    }
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
  chains: [CHAIN.BASE, CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.POLYGON],
  start: "2025-10-01",
  methodology: {
    Fees: "Total yield earned across all Morpho vault positions (V2/V3, share price changes) plus V4 rebalance profit and Merkl rewards.",
    Revenue: "10% performance fee on yield.",
    ProtocolRevenue: "Protocol retains no revenue; all fees go to SURF buybacks.",
    HoldersRevenue: "All revenue is distributed to SURF holders via token buybacks.",
    SupplySideRevenue: "90% of earned yield retained by vault depositors.",
  },
};

export default adapter;
