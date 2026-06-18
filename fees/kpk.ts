import type { Balances } from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      // All KPK Morpho vaults, listed explicitly (V1 MetaMorpho and V2). They are
      // listed here rather than discovered by owner because every V2 vault's
      // CreateVaultV2 owner is its per-vault creation owner, which was later
      // transferred to the shared Security Council Safe; owner-based discovery
      // would match none of them. The helper reads gross yield from share-price
      // growth for every listed vault. KPK charges a 0% curator fee on Morpho, so
      // these contribute Fees and SupplySideRevenue only, never Revenue.
      morpho: [
        // V1 (legacy, winding down)
        "0xe108fbc04852B5df72f9E44d7C29F47e7A993aDd", // USDC Prime
        "0x0c6aec603d48eBf1cECc7B247a2c3DA08b398DC1", // EURC Yield
        "0xd564F765F9aD3E7d2d6cA782100795a885e8e7C8", // ETH Prime
        "0xc88eFFD6e74D55c78290892809955463468E982A", // ETH Yield
        "0x9178eBE0691593184c1D785a864B62a326cc3509", // USDC Yield
        "0xdaD4e51d64c3B65A9d27aD9F3185B09449712065", // USDT Prime
        // V2 (live book)
        "0x4Ef53d2cAa51C447fdFEEedee8F07FD1962C9ee6", // USDC Prime
        "0xa877D5bb0274dcCbA8556154A30E1Ca4021a275f", // EURC Yield
        "0xbb50a5341368751024ddf33385ba8cf61fe65ff9", // ETH Prime
        "0x5dbf760b4fd0cDdDe0366b33aEb338b2A6d77725", // ETH Yield
        "0xD5cCe260E7a755DDf0Fb9cdF06443d593AaeaA13", // USDC Yield
        "0x870F0BF29A25A40E7CC087cD5C53e70C11F2C8A8", // USDT Prime
        "0x1a1985F50352b58090eb36425AfdFacbaC7806F4", // USDC Prime Core
      ],
      // Euler: KPK earns its 5% interestFee on the UNDERLYING eVaults (borrow
      // markets), not on the Euler Earn aggregator (0% fee, no interestFee). These
      // are the markets KPK governs (governorAdmin = KPK Curator Safe).
      euler: [
        "0x2Ff596321782FE034102f55af5ad707A4Ce0d6a7", // USDC Prime RWA: VBILL
        "0x8b2d7534Ffcf6c2a9226f439CDaC26c6666E97a9", // USDC Prime RWA: STAC
        "0xf55B46C10138782aDE3275D81e44B8464100eAfF", // ETH Yield Term: wstETH
        "0xB5fa20eb3c1A146E1090F24CF3c7D60263Dafa71", // ETH Yield Term: tETH
      ],
    },
    [CHAIN.ARBITRUM]: {
      morpho: [
        "0x2C609d9CfC9dda2dB5C128B2a665D921ec53579d", // USDC Yield (V1)
        "0x5837e4189819637853a357aF36650902347F5e73", // USDC Yield (V2)
      ],
    },
  },
};

// -------------------------------
// Gearbox TreasurySplitter config
// -------------------------------
const TREASURY_SPLITTER = "0x111438B87888abee9bf2759599AAB423DcA54786";

// KPK's Gearbox curator fee is routed as diesel (ERC-4626) shares into the
// splitter on credit-account repayment, then split 50/50 on distribute(). The
// diesel-share tokens themselves are not reliably priced by DefiLlama (e.g.
// kpkWETH has no price feed), so each received amount is converted to its
// underlying asset via convertToAssets() and booked as the underlying, which is
// priced. The diesel share is worth more than 1:1 of its underlying (it accrues
// interest), so this conversion is required for correct valuation.
const GEARBOX_DIESEL_TOKENS = [
  {
    share: "0x9396DCbf78fc526bb003665337C5E73b699571EF", // kpkWETH
    underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  },
  {
    share: "0xA9d17f6D3285208280a1Fd9B94479c62e0AABa64", // kpkwstETH
    underlying: "0x7f39C581F595B53c5cb19bd0b3f8dA6c935E2Ca0", // wstETH
  },
];

// 50% of Gearbox fees (defaultSplit() on the splitter = 5000 bps each receiver)
const KPK_SHARE_BPS = 5000n;

// Base curator adapter (Morpho + Euler fees, via share-price growth)
const baseAdapter: SimpleAdapter = getCuratorExport(curatorConfig);

// Wrap each chain fetch to add Gearbox TreasurySplitter inflows
for (const [chain, chainCfg] of Object.entries(baseAdapter.adapter ?? {})) {
  const originalFetch = chainCfg.fetch as ((o: FetchOptions) => Promise<FetchResultV2>) | undefined;
  if (!originalFetch) continue;

  chainCfg.fetch = (async (options: FetchOptions): Promise<FetchResultV2> => {
    // 1) Morpho + Euler vault fees
    const morphoResult = await originalFetch(options);

    const dailyFees: Balances =
      (morphoResult.dailyFees as Balances) ?? options.createBalances();

    const dailySupplySideRevenue: Balances =
      (morphoResult.dailySupplySideRevenue as Balances) ?? options.createBalances();

    // Carry forward the curator revenue the helper already computed (Euler 5%
    // interestFee). Morpho contributes none (KPK charges 0% on Morpho).
    const dailyRevenue: Balances =
      (morphoResult.dailyRevenue as Balances) ?? options.createBalances();

    // 2) Gearbox TreasurySplitter fees (ETH chain only). Inflows into the splitter
    // (diesel shares minted by the pool on repayment) are the accrual signal; the
    // outflows are KPK's manual distribute() claims and are intentionally ignored.
    if (chain === CHAIN.ETHEREUM) {
      const shareTokens = GEARBOX_DIESEL_TOKENS.map((t) => t.share);

      // amount of each diesel share received by the splitter this period
      const gearboxReceived: Balances = await addTokensReceived({
        options,
        tokens: shareTokens,
        targets: [TREASURY_SPLITTER],
      });
      const raw = gearboxReceived.getBalances();

      // map "ethereum:<addr>" / "<addr>" -> received share amount (lowercased)
      const receivedByShare: Record<string, bigint> = {};
      for (const [tokenId, rawAmount] of Object.entries(raw)) {
        const amount = BigInt(rawAmount.toString());
        if (amount === 0n) continue;
        const addr = (tokenId.includes(":") ? tokenId.split(":")[1] : tokenId).toLowerCase();
        receivedByShare[addr] = amount;
      }

      // convert each received share amount to its underlying asset (the diesel
      // share is worth > 1:1 of underlying and is not reliably priced)
      const dieselWithFlow = GEARBOX_DIESEL_TOKENS.filter(
        (t) => receivedByShare[t.share.toLowerCase()],
      );
      if (dieselWithFlow.length > 0) {
        const underlyingAmounts = await options.api.multiCall({
          abi: "function convertToAssets(uint256 shares) view returns (uint256)",
          calls: dieselWithFlow.map((t) => ({
            target: t.share,
            params: [receivedByShare[t.share.toLowerCase()].toString()],
          })),
          permitFailure: true,
        });

        for (let i = 0; i < dieselWithFlow.length; i++) {
          const assets = underlyingAmounts[i] ? BigInt(underlyingAmounts[i]) : 0n;
          if (assets === 0n) continue;

          const underlying = dieselWithFlow[i].underlying;
          dailyFees.add(underlying, assets);

          // KPK keeps 50% (revenue); the other 50% goes to the second splitter
          // recipient and is treated as supply-side so that
          // dailyFees = dailyRevenue + dailySupplySideRevenue holds.
          const kpkShare = (assets * KPK_SHARE_BPS) / 10_000n;
          if (kpkShare > 0n) {
            dailyRevenue.add(underlying, kpkShare);
          }
          dailySupplySideRevenue.add(underlying, assets - kpkShare);
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
  Fees: "Gross interest/yield from KPK-curated Morpho and Euler vaults, plus realized Gearbox TreasurySplitter inflows.",
  Revenue: "Curator's cut: Euler 5% interestFee on KPK's underlying markets + 50% of Gearbox TreasurySplitter inflows. Morpho is excluded (KPK charges a 0% curator fee on Morpho).",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "Interest/yield distributed to vault depositors (Morpho and Euler), plus the half of Gearbox TreasurySplitter inflows that goes to the second recipient.",
};

// daily granularity is sufficient for share-price-growth accrual; avoids 24x multicall load
// baseAdapter.pullHourly = true;

export default baseAdapter;
