import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import { getConfig } from "./cache";
import { httpGet } from "../utils/fetchURL";

// Euler vaults whose borrows went bad. The vault oracle keeps quoting the collapsed collateral, so nobody
// liquidates and the debt keeps compounding at the IRM rate (up to the 60%+ max on a frozen vault). That
// interest is never paid, it only lifts the share price, so the vault is dropped from fee tracking from the
// day its debt went bad. Every entry is flagged by Euler's bad-debt feed below and deprecated in Euler's own
// labels (github.com/euler-xyz/euler-labels, <chainId>/products.json deprecatedVaults); `from` is the
// incident date, confirmed on-chain by the vault's cash running out on or right after it.
// Stream Finance (xUSD) collapse; the Stream- and USDX-exposed vaults below ran out of cash between 10-31 and 11-05
const STREAM_COLLAPSE = "2025-11-04";
const RESOLV_INCIDENT = "2026-03-22";

const BAD_DEBT_VAULTS: Record<string, Array<{ vault: string; from: string }>> = {
  [CHAIN.ETHEREUM]: [
    { vault: "0x01864aE3c7d5f507cC4c24cA67B4CABbDdA37EcD", from: STREAM_COLLAPSE }, // eUSDC-64, TelosC Stream
    { vault: "0x038dd0Eb275B7DE3B07884f1Fa106eD6423C45F2", from: STREAM_COLLAPSE }, // eWBTC-9, TelosC Stream
    { vault: "0x211711F277f146fC947D7053B41BB71BB5b5FC2C", from: STREAM_COLLAPSE }, // eWETH-33, TelosC Stream
    // eUSDC-47, Frontier Yala: lent against YU / PT-YU, which its oracle still prices at $1. YU fell from
    // $0.999 on 2025-11-14 to $0.19 on 11-17 (~$0.01 now); the vault has had no cash since and compounds at 60%
    { vault: "0x481D4909D7ca2eb27c4975f08dCE07DBeF0d3Fa7", from: "2025-11-15" },
    // eUSDC-58, Rezerve: deprecated after governance passed to an unrecognized entity, no cash since 2025-11-11
    { vault: "0xC42d337861878baa4dC820D9E6B6C667C2b57e8A", from: "2025-11-11" },
    { vault: "0xcBC9B61177444A793B85442D3a953B90f6170b7D", from: RESOLV_INCIDENT }, // eUSDC-19, Resolv
  ],
  [CHAIN.BSC]: [
    { vault: "0xC41f2Ba7102e9F9F2d603eb951F955aE205ed272", from: STREAM_COLLAPSE }, // eUSD1-2, Re7 (Stables Labs USDX)
    { vault: "0x69A93DbAB609266af96f05658b2e22d020de2E19", from: STREAM_COLLAPSE }, // eUSDT-4, Re7 (Stables Labs USDX)
    { vault: "0x3ac88AfbC38Bb41443457eeB027b60e85B815538", from: STREAM_COLLAPSE }, // eWBNB-5, Re7 (Stables Labs USDX)
  ],
  [CHAIN.PLASMA]: [
    { vault: "0x57c582346B7d49A46Af3745A8278917D1c1311b8", from: STREAM_COLLAPSE }, // eUSDT0-7, TelosC Stream
    { vault: "0xF675FBe777E992f5D5D84AdF41161dC0f20104a6", from: STREAM_COLLAPSE }, // eUSDT0-23, Re7 xUSD
    { vault: "0xb5526491742FEe67E9E0D0D8c619A95D422fd398", from: STREAM_COLLAPSE }, // eUSDT0-25, Frontier Trevee
    { vault: "0x3799251bD81925cfcCF2992F10Af27A4e62Bf3F7", from: STREAM_COLLAPSE }, // eUSDT0-22, Frontier Elixir
    { vault: "0xF90Cf999dE728A582e154F926876b70e93a747B7", from: STREAM_COLLAPSE }, // emsUSD-3, TelosC Stream
  ],
  // deprecated without a stated reason; all four ran out of cash between 2025-11-04 and 11-17
  [CHAIN.AVAX]: [
    { vault: "0xa446938b0204Aa4055cdFEd68Ddf0E0d1BAB3E9E", from: STREAM_COLLAPSE }, // eUSDt-3, K3
    { vault: "0x2137568666f12fc5A026f5430Ae7194F1C1362aB", from: STREAM_COLLAPSE }, // eAUSD-2, Re7
    { vault: "0x8f23Da78e3F31Ab5DEb75dC3282198bed630ffde", from: STREAM_COLLAPSE }, // eUSDC-15, Keyring
    { vault: "0xABA9d2D4b6B93C3dc8976D8eb0690CCA56431FE4", from: STREAM_COLLAPSE }, // eUSDt-2, Re7
  ],
  [CHAIN.BASE]: [
    { vault: "0xC063C3b3625DF5F362F60f35B0bcd98e0fa650fb", from: RESOLV_INCIDENT }, // eUSDC-3, Apostro Resolv
  ],
};

// Euler's own bad-debt feed (https://v3.euler.finance/v3/openapi.json, getVaultsBadDebt): per borrow vault,
// the debt of underwater accounts with collateral at market prices, so a dead collateral counts as zero even
// while the vault oracle quotes it at par. It is a snapshot of now with no history, so it cannot date
// anything: a flagged vault without an entry above is dropped on every date until it gets one.
const BAD_DEBT_API = "https://v3.euler.finance/v3/evk/vaults/bad-debt";
const VAULT_API = "https://v3.euler.finance/v3/evk/vaults";
// chains with the `risk` capability in https://v3.euler.finance/v3/chains
const BAD_DEBT_CHAIN_IDS: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.BASE]: 8453,
  [CHAIN.MONAD]: 143,
  [CHAIN.HYPERLIQUID]: 999,
  [CHAIN.BSC]: 56,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.AVAX]: 43114,
  [CHAIN.LINEA]: 59144,
};
// a vault is dropped once at least half of its borrows are bad debt: below that most of its interest is real
// and dropping the whole vault would lose more than it removes. dust under $10k is ignored.
const MIN_BAD_DEBT_USD = 10_000;
const MIN_BAD_DEBT_SHARE = 0.5;

async function getFlaggedVaults(options: FetchOptions): Promise<Array<string>> {
  const { chain } = options;
  const chainId = BAD_DEBT_CHAIN_IDS[chain];
  if (!chainId) return [];

  const flagged = await getConfig(`euler/bad-debt-vaults/${chain}`, undefined, {
    fetcher: async () => {
      const rows: Array<any> = [];
      while (true) {
        const { data, meta } = await httpGet(`${BAD_DEBT_API}?chainId=${chainId}&minBadDebtUsd=${MIN_BAD_DEBT_USD}&limit=100&offset=${rows.length}`);
        rows.push(...data);
        if (!data.length || rows.length >= meta.total) break;
      }
      const vaults: Array<string> = [];
      for (const row of rows) {
        const { data: vault } = await httpGet(`${VAULT_API}/${chainId}/${row.borrowVault}`);
        // totalBorrowsUsd is null when the borrowed asset has no price; the share cannot be checked, keep the flag
        if (vault.totalBorrowsUsd && row.badDebtUsd < vault.totalBorrowsUsd * MIN_BAD_DEBT_SHARE) continue;
        vaults.push(row.borrowVault.toLowerCase());
      }
      return { vaults };
    },
  });
  if (!Array.isArray(flagged?.vaults)) {
    options.api.log(`euler bad debt: no feed and no cache for ${chain}, running with the dated list only`);
    return [];
  }
  return flagged.vaults;
}

// Euler vaults to leave out of fee tracking on the window's chain and date: dated entries from their incident
// date onwards, plus vaults the bad-debt feed flags now that have no dated entry yet.
export async function getEulerExcludedVaults(options: FetchOptions): Promise<Set<string>> {
  const { chain, dateString } = options;
  const dated = BAD_DEBT_VAULTS[chain] ?? [];
  const excluded = new Set(dated.filter((i) => dateString >= i.from).map((i) => i.vault.toLowerCase()));
  const datedVaults = new Set(dated.map((i) => i.vault.toLowerCase()));
  for (const vault of await getFlaggedVaults(options)) {
    if (datedVaults.has(vault)) continue; // its entry above decides from when
    excluded.add(vault);
  }
  return excluded;
}
