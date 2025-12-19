import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const ABI = {
  FeesMinted: "event FeesMinted(uint256 amount)",
  getSharePrice: "function getSharePrice() view returns (uint256)",
  decimals: "uint8:decimals",
  perfFeeRate: "function perfFeeRate() view returns (uint256)",
  perfFeeSplitBps: "function perfFeeSplitBps() view returns (uint256[])",
  sharePriceWatermark: "function sharePriceWatermark() view returns (uint256)",
  totalSupply: "function totalSupply() view returns (uint256)",
};

type MachineConfig = {
  shareToken: string;
  accountingToken: string;
  depositor: string;
  preDepositVault?: string;
  sharePriceOracle: string;
  feeManager: string;
  machine: string;
};

const MACHINES: MachineConfig[] = [
  {
    shareToken: "0x1e33e98af620f1d563fcd3cfd3c75ace841204ef",
    accountingToken: ADDRESSES.ethereum.USDC,
    depositor: "0x94B1828F91c150C5E6776198e170aCa4304903d7",
    preDepositVault: "0x5df4cb0aaae0fcc9de3f41e72348609e30a49c44",
    sharePriceOracle: "0xFFCBc7A7eEF2796C277095C66067aC749f4cA078",
    feeManager: "0xa7f0121375dc52028e333f02715183a1d1a690a7",
    machine: "0x6b006870c83b1cd49e766ac9209f8d68763df721",
  },
  {
    shareToken: "0x871ab8e36cae9af35c6a3488b049965233deb7ed",
    accountingToken: ADDRESSES.ethereum.WETH,
    depositor: "0x9662d85fdBc68F2218974aabdcdE5e61B59132B0",
    preDepositVault: "0xefc8e0fce12c164eafcb588915c6f0ca7ca41a53",
    sharePriceOracle: "0x49fba73738461835fefB19351b161Bde4BcD6b5A",
    feeManager: "0xa28a77ed5b51f232c2658b28c4f7998559174e7c",
    machine: "0x0447d0ad7fd6a3409b48ecbb9ddb075c1e11d735",
  },
  {
    shareToken: "0x972966bcc17f7d818de4f27dc146ef539c231bdf",
    accountingToken: ADDRESSES.ethereum.WBTC,
    depositor: "0xb0475F38393E98c851F8e0377002fD45E2201E4D",
    preDepositVault: "0x49af2649eefbc7e3847b41100fddcf91134a549e",
    sharePriceOracle: "0x8B04bf6A374C40887F03B1928871c96f006Bb2fc",
    feeManager: "0x98072b0c7b0a618b277e62a0d2f52da249819c13",
    machine: "0xfcbe132452b6caa32addd4768db8fa02af73d841",
  },
];

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const machine of MACHINES) {
    // Fetch all fees minted logs
    const feeLogs: any[] = await options.getLogs({
      target: machine.machine,
      eventAbi: ABI.FeesMinted,
      onlyArgs: true,
    });

    // Sum minted shares
    let totalFeeShares = 0;
    for (const log of feeLogs) {
      totalFeeShares += Number(log.amount);
    }

    const [
      accountingTokenDecimals,
      perfFeeRate,
      perfFeeSplitBps,
      watermark,
    ] = await Promise.all([
      options.api.call({
        target: machine.accountingToken,
        abi: ABI.decimals,
      }),
      options.api.call({
        target: machine.feeManager,
        abi: ABI.perfFeeRate,
      }),
      options.api.call({
        target: machine.feeManager,
        abi: ABI.perfFeeSplitBps,
      }),
      options.api.call({
        target: machine.feeManager,
        abi: ABI.sharePriceWatermark,
      }),
    ]);

    // Fetch previous and new share price
    const prevTokenPrice = await options.fromApi.call({
      target: machine.sharePriceOracle,
      abi: ABI.getSharePrice,
    });

    const newTokenPrice = await options.toApi.call({
      target: machine.sharePriceOracle,
      abi: ABI.getSharePrice,
    });

    // Fetch share token supply
    const totalSupply = await options.api.call({
      target: machine.shareToken,
      abi: ABI.totalSupply,
    });

    const totalFees = totalFeeShares * newTokenPrice / 1e18 / 1e18 * 10 ** Number(accountingTokenDecimals) 

    // https://docs.makina.finance/concepts/machine/fee-managers
    // The WatermarkFeeManager implementation supports a high watermark mechanism 
    // ensures performance fee are charged only when the new share price exceeds the stored watermark.
    const totalSupplyScaled = Number(totalSupply) / 1e18;
    const newTokenPriceScaled = Number(newTokenPrice) / 1e18;
    const prevTokenPriceScaled = Number(prevTokenPrice) / 1e18;
    const perfFeeRateScaled = Number(perfFeeRate) / 1e18;
    const watermarkScaled = Number(watermark)/1e18

    const priceDiff = Math.max(newTokenPriceScaled - prevTokenPriceScaled, 0);

    const performanceFees =
      newTokenPriceScaled > watermarkScaled
        ? (totalSupplyScaled * priceDiff * perfFeeRateScaled) / newTokenPriceScaled
        : 0;

    // convert to token decimals
    const performanceFeesTokenDecimal = performanceFees * 10 ** Number(accountingTokenDecimals)

    const split = perfFeeSplitBps.map(Number);
    const operatorRevenue = (performanceFeesTokenDecimal * split[0]) / 10_000;
    const protocolRevenue = (performanceFeesTokenDecimal * split[1]) / 10_000;

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
      "Fees are derived from total Machine Token shares minted.",
    Revenue:
      "Revenue represents the operator and protocol share of performance fees.",
    ProtocolRevenue:
      "Protocol revenue is the Makina-controlled portion of performance fees.",
    SupplySideRevenue:
      "0 — fees are paid via share dilution rather than direct transfers.",
  },
  breakdownMethodology: {
    Fees: {
      "Performance Fees":
        "Fees accrued from Machine token share price increase above the watermark, the performance fee is then split two ways between the Operator and the Makina DAO.",
    },
    Revenue: {
      "Operator Revenue": "Operator's portion of performance fees.",
      "Protocol Revenue": "Makina-controlled portion of performance fees.",
    },
    ProtocolRevenue: {
      "Protocol Revenue": "Makina-controlled portion of performance fees.",
    },
    SupplySideRevenue: {
      "Supply Side": "0 — no direct fees to supply side; any yield is reflected in share price appreciation.",
    },
  },
};

export default adapter;
