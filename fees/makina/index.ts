import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ABI = {
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  getSharePrice: "function getSharePrice() view returns (uint256)",
  decimals: "uint8:decimals",
  mgmtFeeReceivers: "function mgmtFeeReceivers() view returns (address[])",
  mgmtFeeSplitBps: "function mgmtFeeSplitBps() view returns (uint256[])",
};

type MachineConfig = {
  shareToken: string;
  accountingToken: string;
  depositor: string;
  preDepositVault?: string;
  sharePriceOracle: string;
  feeManager: string;
};

const MACHINES: MachineConfig[] = [
  {
    shareToken: "0x1e33e98af620f1d563fcd3cfd3c75ace841204ef",
    accountingToken: ADDRESSES.ethereum.USDC,
    depositor: "0x94B1828F91c150C5E6776198e170aCa4304903d7",
    preDepositVault: "0x5df4cb0aaae0fcc9de3f41e72348609e30a49c44",
    sharePriceOracle: "0xFFCBc7A7eEF2796C277095C66067aC749f4cA078",
    feeManager: "0xa7f0121375dc52028e333f02715183a1d1a690a7",
  },
  {
    shareToken: "0x871ab8e36cae9af35c6a3488b049965233deb7ed",
    accountingToken: ADDRESSES.ethereum.WETH,
    depositor: "0x9662d85fdBc68F2218974aabdcdE5e61B59132B0",
    preDepositVault: "0xefc8e0fce12c164eafcb588915c6f0ca7ca41a53",
    sharePriceOracle: "0x49fba73738461835fefB19351b161Bde4BcD6b5A",
    feeManager: "0xa28a77ed5b51f232c2658b28c4f7998559174e7c",
  },
  {
    shareToken: "0x972966bcc17f7d818de4f27dc146ef539c231bdf",
    accountingToken: ADDRESSES.ethereum.WBTC,
    depositor: "0xb0475F38393E98c851F8e0377002fD45E2201E4D",
    preDepositVault: "0x49af2649eefbc7e3847b41100fddcf91134a549e",
    sharePriceOracle: "0x8B04bf6A374C40887F03B1928871c96f006Bb2fc",
    feeManager: "0x98072b0c7b0a618b277e62a0d2f52da249819c13",
  },
];

async function getOraclePrice(options: FetchOptions, oracle: string) {
  return Number(await options.api.call({ target: oracle, abi: ABI.getSharePrice }));
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const machine of MACHINES) {
    const logs: any[] = await options.getLogs({
      target: machine.shareToken,
      eventAbi: ABI.Transfer,
      onlyArgs: true,
    });

    const [receivers, splitBpsRaw] = await Promise.all([
      options.api.call({ target: machine.feeManager, abi: ABI.mgmtFeeReceivers }),
      options.api.call({ target: machine.feeManager, abi: ABI.mgmtFeeSplitBps }),
    ]);

    const splitBps = splitBpsRaw.map(Number);

    const feeReceivers = new Set(
      receivers.map((a: string) => a.toLowerCase())
    );

    feeReceivers.delete(machine.depositor.toLowerCase());
    if (machine.preDepositVault) {
      feeReceivers.delete(machine.preDepositVault.toLowerCase());
    }

    let totalFeeShares = 0n;

    for (const log of logs) {
      const from = (log.from ?? "").toLowerCase();
      const to = (log.to ?? "").toLowerCase();
      if (from !== ZERO_ADDRESS) continue;
      if (!feeReceivers.has(to)) continue;
      totalFeeShares += BigInt(log.value);
    }

    const oraclePrice = await getOraclePrice(options, machine.sharePriceOracle);
    const accountingTokenDecimals = await options.api.call({
      target: machine.accountingToken,
      abi: ABI.decimals,
    });

    const totalFees =
      Number(totalFeeShares) * oraclePrice / 1e18 / 1e18 * (10 ** accountingTokenDecimals);

    const operatorRevenue = (totalFees * splitBps[0]) / 10_000;
    const protocolRevenue = (totalFees * splitBps[1]) / 10_000;

    dailyFees.add(machine.accountingToken, totalFees);
    dailyRevenue.add(machine.accountingToken, operatorRevenue);
    dailyRevenue.add(machine.accountingToken, protocolRevenue);
    dailyProtocolRevenue.add(machine.accountingToken, protocolRevenue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: 0,
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
    Fees:
      "Fees are calculated from Machine Token shares minted to Fee Manager receivers. These shares represent the combined management and performance fees.",
    Revenue:
      "Revenue is split between the Operator and Makina Protocol using basis point splits defined in the Fee Manager contracts.",
    ProtocolRevenue:
      "Protocol revenue is the portion of fees allocated to Makina-controlled addresses.",
    SupplySideRevenue:
      "0 — fees are paid via share dilution rather than direct transfers from user balances.",
  },
  breakdownMethodology: {
    Fees: {
      Operator:
        "Operator portion of fees as defined by the Fee Manager basis point split.",
      Protocol:
        "Makina Protocol portion of fees as defined by the Fee Manager basis point split.",
    },
    Revenue: {
      Operator:
        "Operator portion of management and performance fees.",
      Protocol:
        "Makina Protocol portion of management and performance fees.",
    },
    ProtocolRevenue: {
      Protocol:
        "Makina Protocol portion of fees received via fee share minting.",
    },
    SupplySideRevenue: {
      Shares:
        "Fee shares minted via dilution; no direct revenue transfer to depositors.",
    },
  },
};

export default adapter;
