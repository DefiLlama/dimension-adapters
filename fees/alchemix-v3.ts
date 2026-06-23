import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { ethers } from "ethers";

// Alchemix V3 deploys its yield-bearing collateral as standalone ERC-4626 "MYT"
// vaults from a VaultV2Factory on each chain. Each vault takes an on-chain
// performance fee before the remaining yield is reflected in convertToAssets().
//
// These vaults are a separate contract set from the V2 alchemists (which
// fees/alchemix.ts tracks via the Harvest event), so the two adapters do not
// overlap.

const CREATE_VAULT_EVENT =
  "event CreateVaultV2(address indexed owner, address indexed asset, bytes32 salt, address indexed newVaultV2)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const WAD = 1e18;

type AlchemixV3Market = {
  myt: string;
  alchemist: string;
  transmuter: string;
  syntheticToken: string;
};

// Factories are the same source the V3 TVL adapter enumerates vaults from:
// https://github.com/DefiLlama/DefiLlama-Adapters/blob/master/projects/alchemix-v3/index.js
// fromBlock = the factory deployment block on each chain (ETH factory deployed 2026-04-14).
// Alchemist/Transmuter addresses come from Alchemix's V3 deployment artifacts:
// https://github.com/alchemix-finance/v3/tree/master/broadcast
const chainConfig: Record<string, { start: string; factory: string; fromBlock: number; feeReceiver: string; markets: AlchemixV3Market[] }> = {
  [CHAIN.ETHEREUM]: {
    start: "2026-04-14",
    factory: "0xdd56b00302e91c4c2b8246156bdeaa1cedc58984",
    fromBlock: 24875892,
    feeReceiver: "0x9e2b6378ee8ad2A4A95Fe481d63CAba8FB0EBBF9",
    markets: [
      {
        myt: "0x9b44efca3e2a707b63dc00ce79d646e5e5d24ba5",
        alchemist: "0xeb83112d925268bede86654c13d423a987587e3e",
        transmuter: "0x2584e8b0616b3e750492c9629a3b27679c410cb9",
        syntheticToken: "0xBC6DA0FE9aD5f3b0d58160288917AA56653660E9",
      },
      {
        myt: "0x29bcfed246ce37319d94eba107db90c453d4c43d",
        alchemist: "0xfa995b6abc387376c3e7de5f6d394ab5b6bee26b",
        transmuter: "0x073598132f37756a7e665fb52f1757463120bd3c",
        syntheticToken: "0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6",
      },
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2026-04-14",
    factory: "0x8c7c0c380ba4ee38461eb5a6b82e5d930ec11ca2",
    fromBlock: 452291175,
    feeReceiver: "0x7e108711771DfdB10743F016D46d75A9379cA043",
    markets: [
      {
        myt: "0xeba62b842081cef5a8184318dc5c4e4aaca9f651",
        alchemist: "0x930750a3510e703535e943e826aba3c364ffc1de",
        transmuter: "0x693b7594ae0633d9c5574d0da46a040f92f5b281",
        syntheticToken: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
      },
      {
        myt: "0xfe8f223f3d81462f55bf8609897b8cecfa4b195c",
        alchemist: "0xded3a04612ff12b57317abe38e68026fc9d28114",
        transmuter: "0x2584e8b0616b3e750492c9629a3b27679c410cb9",
        syntheticToken: "0x17573150d67d820542EFb24210371545a4868B03",
      },
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: "2026-04-14",
    factory: "0x8c7c0c380ba4ee38461eb5a6b82e5d930ec11ca2",
    fromBlock: 150271732,
    feeReceiver: "0xC224bf25Dcc99236F00843c7D8C4194abE8AA94a",
    markets: [
      {
        myt: "0xaf510a560744880410f0f65e3341a020fbc2ca41",
        alchemist: "0x930750a3510e703535e943e826aba3c364ffc1de",
        transmuter: "0x693b7594ae0633d9c5574d0da46a040f92f5b281",
        syntheticToken: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
      },
      {
        myt: "0x91b8657aea26caa8a0e9d6dd4e24727ccf32f822",
        alchemist: "0xded3a04612ff12b57317abe38e68026fc9d28114",
        transmuter: "0x2584e8b0616b3e750492c9629a3b27679c410cb9",
        syntheticToken: "0x3E29D3A9316dAB217754d13b28646B76607c5f04",
      },
    ],
  },
};

function topicAddress(address: string) {
  return ethers.zeroPadValue(address.toLowerCase(), 32);
}

async function addMytShareFeesAsUnderlying(options: FetchOptions, balances: any, market: AlchemixV3Market, feeReceiver: string, label: string) {
  const logs = await options.getLogs({
    target: market.myt,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, [topicAddress(market.alchemist), topicAddress(market.transmuter)] as any, topicAddress(feeReceiver)] as any,
  });
  const shares = logs.reduce((sum, log: any) => sum + BigInt(log.value), 0n);
  if (shares === 0n) return;

  const asset = await options.toApi.call({ target: market.myt, abi: "address:asset" });
  const assets = await options.toApi.call({
    target: market.myt,
    abi: "function convertToAssets(uint256 shares) view returns (uint256 assets)",
    params: [shares.toString()],
  });
  balances.add(asset, assets, label);
}

async function addSyntheticFees(options: FetchOptions, balances: any, market: AlchemixV3Market, feeReceiver: string) {
  const logs = await options.getLogs({
    target: market.syntheticToken,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, topicAddress(market.transmuter), topicAddress(feeReceiver)] as any,
  });
  for (const log of logs) balances.add(market.syntheticToken, log.value, "Transmuter Early-Exit Fees");
}

async function addVaultYield(options: FetchOptions, vaults: string[], dailyFees: any, dailyRevenue: any, dailySupplySideRevenue: any) {
  const assets = await options.toApi.multiCall({ abi: "address:asset", calls: vaults, permitFailure: true });
  const totalSupplies = await options.toApi.multiCall({ abi: "uint256:totalSupply", calls: vaults, permitFailure: true });
  const decimals = await options.toApi.multiCall({ abi: "uint8:decimals", calls: vaults, permitFailure: true });
  const convertCalls = vaults.map((vault, index) => ({
    target: vault,
    params: [String(10 ** Number(decimals[index]))],
  }));
  const cumulativeIndexBefore = await options.fromApi.multiCall({
    abi: "function convertToAssets(uint256) view returns (uint256)",
    calls: convertCalls,
    permitFailure: true,
  });
  const cumulativeIndexAfter = await options.toApi.multiCall({
    abi: "function convertToAssets(uint256) view returns (uint256)",
    calls: convertCalls,
    permitFailure: true,
  });

  for (let i = 0; i < vaults.length; i++) {
    const token = assets[i];
    const totalSupply = totalSupplies[i];
    const decimal = decimals[i];
    const before = cumulativeIndexBefore[i];
    const after = cumulativeIndexAfter[i];
    if (!token || !totalSupply || !decimal || !before || !after) continue;

    const netYield = (Number(after) - Number(before)) * Number(totalSupply) / (10 ** Number(decimal));
    let performanceFee = 0;
    try {
      const performanceFeeRaw = await options.toApi.call({ target: vaults[i], abi: "uint96:performanceFee" });
      performanceFee = Number(performanceFeeRaw) / WAD;
    } catch { }
    if (netYield > 0 && performanceFee > 0 && performanceFee < 1) {
      const grossYield = netYield / (1 - performanceFee);
      const protocolYield = grossYield - netYield;
      dailyFees.add(token, grossYield, METRIC.ASSETS_YIELDS);
      dailyRevenue.add(token, protocolYield, "MYT Performance Fees");
      dailySupplySideRevenue.add(token, netYield, "MYT Yield To Depositors");
    } else {
      dailyFees.add(token, netYield, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(token, netYield, "MYT Yield To Depositors");
    }
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { factory, fromBlock, feeReceiver, markets } = chainConfig[options.chain];

  const logs = await options.getLogs({
    target: factory,
    eventAbi: CREATE_VAULT_EVENT,
    fromBlock,
    cacheInCloud: true,
  });
  const vaults: string[] = logs.map((log: any) => log.newVaultV2);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (vaults.length) {
    await addVaultYield(options, vaults, dailyFees, dailyRevenue, dailySupplySideRevenue);
  }
  for (const market of markets) {
    await addMytShareFeesAsUnderlying(options, dailyFees, market, feeReceiver, "Alchemist/Transmuter Protocol Fees");
    await addMytShareFeesAsUnderlying(options, dailyRevenue, market, feeReceiver, "Alchemist/Transmuter Protocol Fees");
    await addSyntheticFees(options, dailyFees, market, feeReceiver);
    await addSyntheticFees(options, dailyRevenue, market, feeReceiver);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Gross yield generated by all Alchemix V3 ERC-4626 (MYT) vaults, measured from each vault's share-price (convertToAssets) growth over the measurement period and grossed up by the on-chain performanceFee(), plus realized Alchemist/Transmuter protocol fees transferred to the fee receiver.",
  Revenue: "MYT performance fees and realized Alchemist/Transmuter protocol fees collected by the Alchemix protocol.",
  ProtocolRevenue: "MYT performance fees and realized Alchemist/Transmuter protocol fees collected by the Alchemix protocol.",
  SupplySideRevenue: "Net MYT yield left to depositors/borrowers after performance fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Gross yield generated by Alchemix V3 MYT vaults, using each vault's on-chain performanceFee().",
    "Alchemist/Transmuter Protocol Fees": "MYT shares transferred from Alchemist/Transmuter contracts to the protocol fee receiver, converted to underlying assets.",
    "Transmuter Early-Exit Fees": "Synthetic tokens transferred from Transmuter contracts to the protocol fee receiver when users exit before maturity.",
  },
  Revenue: {
    "MYT Performance Fees": "On-chain MYT performance fee share of gross vault yield.",
    "Alchemist/Transmuter Protocol Fees": "MYT shares transferred from Alchemist/Transmuter contracts to the protocol fee receiver, converted to underlying assets.",
    "Transmuter Early-Exit Fees": "Synthetic tokens transferred from Transmuter contracts to the protocol fee receiver when users exit before maturity.",
  },
  SupplySideRevenue: {
    "MYT Yield To Depositors": "Net MYT yield left to depositors/borrowers after performance fees.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: false,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // a vault's share price can dip on a loss day before the next yield accrual
};

export default adapter;
