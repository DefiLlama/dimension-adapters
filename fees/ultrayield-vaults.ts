import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://ultrayield.gitbook.io/ultrayield
// https://github.com/UltraYield/contracts
const vaults: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    "0x8ecc0b419dfe3ae197bc96f2a03636b5e1be91db", // Kelp sbUSD Vault
    "0x472425cc95be779126afa4aa17980210d299914f", // UltraYield BTC
    "0x546329a16dcedc46e93f7b03a65f49a84700bca1", // UltraYield USD
    "0xaa3cb36be406e6cf208d218fd214e0f1a71e957d", // LoopedBTC
    "0xfacaa225fcfcd8644a77f2cce833907537198ae9", // Resolv USR Ecosystem Vault
  ],
};

const abis = {
  convertToAssets:
    "function convertToAssets(uint256 shares) view returns (uint256)",
  totalSupply: "uint256:totalSupply",
  asset: "address:asset",
  decimals: "uint8:decimals",
  feesCollected:
    "event FeesCollected(uint256 shares, uint256 managementFee, uint256 performanceFee)",
  withdrawalFeeCollected: "event WithdrawalFeeCollected(uint256 amount)",
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, fromApi, toApi, getLogs } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const vaultList = vaults[chain];

  const [assets, decimals, totalSupplies] = await Promise.all([
    options.api.multiCall({
      abi: abis.asset,
      calls: vaultList,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: abis.decimals,
      calls: vaultList,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: abis.totalSupply,
      calls: vaultList,
      permitFailure: true,
    }),
  ]);

  const convertCalls = vaultList.map((vault, i) => ({
    target: vault,
    params: [String(10 ** Number(decimals[i]))],
  }));

  const [ratesBefore, ratesAfter] = await Promise.all([
    fromApi.multiCall({
      abi: abis.convertToAssets,
      calls: convertCalls,
      permitFailure: true,
    }),
    toApi.multiCall({
      abi: abis.convertToAssets,
      calls: convertCalls,
      permitFailure: true,
    }),
  ]);

  for (let i = 0; i < vaultList.length; i++) {
    const asset = assets[i];
    const decimal = decimals[i];
    const supply = totalSupplies[i];
    const rateBefore = ratesBefore[i];
    const rateAfter = ratesAfter[i];

    if (!asset || !decimal || !supply || !rateBefore || !rateAfter) continue;

    const precision = BigInt(10 ** Number(decimal));

    // Net yield to depositors from share price changes
    const rateDiff = BigInt(rateAfter) - BigInt(rateBefore);
    const yieldAmount = (BigInt(supply) * rateDiff) / precision;

    dailyFees.add(asset, yieldAmount, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(asset, yieldAmount, METRIC.ASSETS_YIELDS);

    // Management + performance fees from FeesCollected events
    const feeLogs = await getLogs({
      target: vaultList[i],
      eventAbi: abis.feesCollected,
    });

    for (const log of feeLogs) {
      const mgmtFee = BigInt(log.managementFee);
      const perfFee = BigInt(log.performanceFee);
      if (mgmtFee > 0n) {
        dailyFees.add(asset, mgmtFee, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(asset, mgmtFee, METRIC.MANAGEMENT_FEES);
        dailyProtocolRevenue.add(asset, mgmtFee, METRIC.MANAGEMENT_FEES);
      }
      if (perfFee > 0n) {
        dailyFees.add(asset, perfFee, METRIC.PERFORMANCE_FEES);
        dailyRevenue.add(asset, perfFee, METRIC.PERFORMANCE_FEES);
        dailyProtocolRevenue.add(asset, perfFee, METRIC.PERFORMANCE_FEES);
      }
    }

    // Withdrawal fees
    const withdrawalLogs = await getLogs({
      target: vaultList[i],
      eventAbi: abis.withdrawalFeeCollected,
    });

    for (const log of withdrawalLogs) {
      dailyFees.add(asset, log.amount, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyRevenue.add(asset, log.amount, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyProtocolRevenue.add(asset, log.amount, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2025-11-11" },
  },
  methodology: {
    Fees: "Yield from vault share price growth plus management, performance, and withdrawal fees.",
    Revenue: "Management, performance, and withdrawal fees collected by the protocol.",
    ProtocolRevenue: "Management, performance, and withdrawal fees collected by the protocol.",
    SupplySideRevenue: "Yield from vault share price growth distributed to depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]:
        "Yield from vault share price growth over the period.",
      [METRIC.MANAGEMENT_FEES]:
        "Annualized fee based on total vault assets and time elapsed.",
      [METRIC.PERFORMANCE_FEES]:
        "Fee on share price gains above the high-water mark.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]:
        "Fee charged on withdrawals in the withdrawn asset.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fees collected by the protocol.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Withdrawal fees collected by the protocol.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fees collected by the protocol.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Withdrawal fees collected by the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield from vault share price growth distributed to depositors.",
    },
  },
};

export default adapter;
