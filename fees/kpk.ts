import type { Balances } from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";

// -------------------------
// KPK's Morpho vaults
// -------------------------
const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      morpho: [
        "0xe108fbc04852B5df72f9E44d7C29F47e7A993aDd",
        "0x0c6aec603d48eBf1cECc7B247a2c3DA08b398DC1",
        "0xd564F765F9aD3E7d2d6cA782100795a885e8e7C8",
        "0x4Ef53d2cAa51C447fdFEEedee8F07FD1962C9ee6",
        "0xa877D5bb0274dcCbA8556154A30E1Ca4021a275f",
        "0xbb50a5341368751024ddf33385ba8cf61fe65ff9",
      ],
    },
    [CHAIN.ARBITRUM]: {
      morpho: [
        "0x2C609d9CfC9dda2dB5C128B2a665D921ec53579d",
      ],
    },
  },
};

// -------------------------------
// Gearbox TreasurySplitter config
// -------------------------------
const TREASURY_SPLITTER = "0x111438B87888abee9bf2759599AAB423DcA54786";

const GEARBOX_FEE_TOKENS = [
  "0xA9d17f6D3285208280a1Fd9B94479c62e0AABa64",
  "0x9396DCbf78fc526bb003665337C5E73b699571EF",
  "0x7f39C581F595B53c5cb19bd0b3f8dA6c935E2Ca0",
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
];

// 50% of Gearbox fees
const KPK_SHARE_BPS = 5000n;

// Base curator adapter
const baseAdapter: SimpleAdapter = getCuratorExport(curatorConfig);

// Wrap each chain fetch
for (const [chain, chainCfg] of Object.entries(baseAdapter.adapter ?? {})) {
  const originalFetch = chainCfg.fetch as ((o: FetchOptions) => Promise<FetchResultV2>) | undefined;
  if (!originalFetch) continue;

  chainCfg.fetch = (async (options: FetchOptions): Promise<FetchResultV2> => {
    // 1) Morpho/Euler fees
    const morphoResult = await originalFetch(options);

    const dailyFees: Balances =
      (morphoResult.dailyFees as Balances) ?? options.createBalances();

    const dailySupplySideRevenue: Balances =
      (morphoResult.dailySupplySideRevenue as Balances) ?? options.createBalances();

    const dailyRevenue: Balances = options.createBalances();

    // 2) Gearbox TreasurySplitter fees (ETH chain only)
    if (chain === "ethereum") {
      const gearboxDailyFees: Balances = await addTokensReceived({
        options,
        tokens: GEARBOX_FEE_TOKENS,
        targets: [TREASURY_SPLITTER],
      });

      const raw = gearboxDailyFees.getBalances();

      for (const [tokenId, rawAmount] of Object.entries(raw)) {
        const amount = BigInt(rawAmount.toString());
        if (amount === 0n) continue;

        // strip "ethereum:" prefix if present
        let cleanToken = tokenId;
        const [maybeChain, addr] = tokenId.split(":");
        if (addr && maybeChain === chain) cleanToken = addr;

        dailyFees.add(cleanToken, amount);

        const half = (amount * KPK_SHARE_BPS) / 10_000n;
        if (half > 0n) {
          dailyRevenue.add(cleanToken, half);
        }
      }
    }

    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }) as any;
}

// Methodology
baseAdapter.methodology = {
  Fees: "Total fee = Morpho/Euler vault fees + all ERC20 transfers of specified Gearbox tokens into TreasurySplitter.",
  Revenue: "Total revenue = 50% of Gearbox TreasurySplitter inflows (Morpho fees excluded).",
  ProtocolRevenue: "Total revenue = 50% of Gearbox TreasurySplitter inflows (Morpho fees excluded).",
  SupplySideRevenue: "Only from Morpho/Euler. Gearbox does not contribute supply-side revenue.",
};

export default baseAdapter;
