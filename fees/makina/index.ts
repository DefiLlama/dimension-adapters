import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const ABI = {
  FeesMinted: "event FeesMinted(uint256 amount)",
  TotalAumUpdate: "event TotalAumUpdated(uint256 totalAum)",
  getSharePrice: "function getSharePrice() view returns (uint256)",
  totalSupply: "function totalSupply() view returns (uint256)",
  decimals: "uint8:decimals",
};

type MachineConfig = {
  shareToken: string;
  accountingToken: string;
  machine: string;
  protocolReceiver: string; // where protocol revenue is sent, as we cannot depend on the order to be consistent
};

// modified from helpers/erc4626.ts
async function getMachineYield({
  options,
  shareTokens,
  machines,
  assetAbi = "address:accountingToken",
  valueAbi = "uint256:totalSupply",
  convertAbi = "function convertToAssets(uint256) view returns (uint256)",
}: {
  options: FetchOptions;
  shareTokens: string[];
  machines: string[];
  assetAbi?: string;
  valueAbi?: string;
  convertAbi?: string;
}) {
  const assets = await options.api.multiCall({
    abi: assetAbi,
    calls: machines,
    permitFailure: true,
  });
  const values = await options.api.multiCall({
    abi: valueAbi,
    calls: shareTokens,
    permitFailure: true,
  });
  const decimals = await options.api.multiCall({
    abi: "uint8:decimals",
    calls: shareTokens,
    permitFailure: true,
  });
  const convertCalls = machines.map((machine, index) => {
    return {
      target: machine,
      params: [String(10 ** Number(decimals[index]))],
    };
  });
  const cumulativeIndexBefore = await options.fromApi.multiCall({
    abi: convertAbi,
    calls: convertCalls,
    permitFailure: true,
  });

  const cumulativeIndexAfter = await options.toApi.multiCall({
    abi: convertAbi,
    calls: convertCalls,
    permitFailure: true,
  });

  const balances = options.createBalances();

  for (let i = 0; i < assets.length; i++) {
    const token = assets[i];
    const value = values[i];
    const decimal = decimals[i];
    const cumulativeIndexBeforeValue = cumulativeIndexBefore[i];
    const cumulativeIndexAfterValue = cumulativeIndexAfter[i];

    if (
      token &&
      value &&
      decimal &&
      cumulativeIndexBeforeValue &&
      cumulativeIndexAfterValue
    ) {
      const totalTokenBalance = Number(value);
      const growthCumulativeIndex =
        Number(cumulativeIndexAfterValue) - Number(cumulativeIndexBeforeValue);
      const growthInterest =
        (growthCumulativeIndex * totalTokenBalance) / 10 ** Number(decimal);
      balances.add(token, growthInterest);
    }
  }
  return balances;
}

const MACHINES: MachineConfig[] = [
  {
    shareToken: "0x1e33e98af620f1d563fcd3cfd3c75ace841204ef",
    accountingToken: ADDRESSES.ethereum.USDC,
    machine: "0x6b006870c83b1cd49e766ac9209f8d68763df721",
    protocolReceiver: "0x68825BAfF4CaEDf6fAcc658269Cf1a0491F1Ba9f",
  },
  {
    shareToken: "0x871ab8e36cae9af35c6a3488b049965233deb7ed",
    accountingToken: ADDRESSES.ethereum.WETH,
    machine: "0x0447d0ad7fd6a3409b48ecbb9ddb075c1e11d735",
    protocolReceiver: "0x68825BAfF4CaEDf6fAcc658269Cf1a0491F1Ba9f",
  },
  {
    shareToken: "0x972966bcc17f7d818de4f27dc146ef539c231bdf",
    accountingToken: ADDRESSES.ethereum.WBTC,
    machine: "0xfcbe132452b6caa32addd4768db8fa02af73d841",
    protocolReceiver: "0x68825BAfF4CaEDf6fAcc658269Cf1a0491F1Ba9f",
  },
];

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const machine of MACHINES) {
    // Fetch all fees minted logs
    const feeLogs: any[] = await options.getLogs({
      target: machine.machine,
      eventAbi: ABI.FeesMinted,
    });

    // Sum minted shares
    let totalFeeShares = 0;
    for (const log of feeLogs) {
      totalFeeShares += Number(log.amount);
    }

    const totalProtocolRevenueShares = await addTokensReceived({
      options,
      tokens: [machine.shareToken],
      targets: [machine.protocolReceiver], // Treasury
    });

    const dailyNetYield = await getMachineYield({
      options,
      shareTokens: [machine.shareToken],
      machines: [machine.machine],
    });

    dailyRevenue.add(machine.shareToken, totalFeeShares);
    dailyProtocolRevenue.add(totalProtocolRevenueShares);
    dailySupplySideRevenue.add(dailyNetYield);

    //Daily fees are net yield + total fees minted
    dailyFees.add(dailyNetYield);
    dailyFees.add(machine.shareToken, totalFeeShares);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-10-25",
    },
  },
  methodology: {
    Fees: "Includes yields earned by Makina machines, performance fee and management fee",
    Revenue:
      "Revenue represents the operator and protocol share of performance and management fees.",
    ProtocolRevenue:
      "Protocol revenue is the Makina-controlled portion of performance and management fees.",
    SupplySideRevenue: "Yields earned by Makina machine depositors post fee",
  },
  breakdownMethodology: {
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "Fixed management fees",
      [METRIC.PERFORMANCE_FEES]:
        "Performance fees on yields generated above a highwater mark",
      "Operator Revenue":
        "Operator's portion of performance and management fees.",
      "Protocol Revenue":
        "Makina-controlled portion of performance and management fees.",
    },
    ProtocolRevenue: {
      "Protocol Revenue":
        "Makina-controlled portion of performance and management fees.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]:
        "Yields earned by Makina machine depositors post fee",
    },
  },
};

export default adapter;
