import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet, httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const DEPLOYER = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7";
const TREASURY = `${DEPLOYER}.dao-treasury`;

const HIRO = "https://api.mainnet.hiro.so";
const PYTH_URL = "https://hermes.pyth.network/v2/updates/price";
const PYTH_IDS = {
  STX: "0xec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17",
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};
const DIA_ORACLE = "SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle";
const STSTX_RATIO =
  "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.block-info-nakamoto-ststx-ratio-v2";
const PRICE_PRECISION = 100000000n;
const STSTX_RATIO_DEC = 1000000n;

interface VaultMeta {
  key: string;
  vaultContract: string;
  ztokenAssetId: string;
  underlyingDecimals: number;
  underlyingSymbol: string;
  underlyingFtAssetId?: string;
}

const VAULTS: VaultMeta[] = [
  {
    key: "stx",
    vaultContract: `${DEPLOYER}.v0-vault-stx`,
    ztokenAssetId: `${DEPLOYER}.v0-vault-stx::zft`,
    underlyingDecimals: 6,
    underlyingSymbol: "STX",
  },
  {
    key: "sbtc",
    vaultContract: `${DEPLOYER}.v0-vault-sbtc`,
    ztokenAssetId: `${DEPLOYER}.v0-vault-sbtc::zft`,
    underlyingDecimals: 8,
    underlyingSymbol: "sBTC",
    underlyingFtAssetId:
      "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token",
  },
  {
    key: "ststx",
    vaultContract: `${DEPLOYER}.v0-vault-ststx`,
    ztokenAssetId: `${DEPLOYER}.v0-vault-ststx::zft`,
    underlyingDecimals: 6,
    underlyingSymbol: "stSTX",
    underlyingFtAssetId:
      "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token::ststx",
  },
  {
    key: "ststxbtc",
    vaultContract: `${DEPLOYER}.v0-vault-ststxbtc`,
    ztokenAssetId: `${DEPLOYER}.v0-vault-ststxbtc::zft`,
    underlyingDecimals: 6,
    underlyingSymbol: "stSTXbtc",
    underlyingFtAssetId:
      "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2::ststxbtc",
  },
  {
    key: "usdc",
    vaultContract: `${DEPLOYER}.v0-vault-usdc`,
    ztokenAssetId: `${DEPLOYER}.v0-vault-usdc::zft`,
    underlyingDecimals: 6,
    underlyingSymbol: "USDC",
    underlyingFtAssetId:
      "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx::usdcx-token",
  },
  {
    key: "usdh",
    vaultContract: `${DEPLOYER}.v0-vault-usdh`,
    ztokenAssetId: `${DEPLOYER}.v0-vault-usdh::zft`,
    underlyingDecimals: 8,
    underlyingSymbol: "USDH",
    underlyingFtAssetId:
      "SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1::usdh",
  },
];

const ZTOKEN_ASSET_IDS = VAULTS.map((v) => `'${v.ztokenAssetId}'`).join(", ");
const VAULT_CONTRACTS = VAULTS.map((v) => `'${v.vaultContract}'`).join(", ");

// ─── Clarity hex decoder ────────────────────────────────────────────────────

function decodeClarity(hex: string): any {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i += 2)
    bytes.push(parseInt(raw.slice(i, i + 2), 16));
  let pos = 0;

  function readU32(): number {
    const v =
      (bytes[pos] << 24) |
      (bytes[pos + 1] << 16) |
      (bytes[pos + 2] << 8) |
      bytes[pos + 3];
    pos += 4;
    return v;
  }

  function read(): any {
    const t = bytes[pos++];
    switch (t) {
      case 0x01: {
        let v = 0n;
        for (let i = 0; i < 16; i++) v = (v << 8n) | BigInt(bytes[pos + i]);
        pos += 16;
        return v;
      }
      case 0x03:
        return true;
      case 0x04:
        return false;
      case 0x05: {
        pos++;
        pos += 20;
        return null;
      }
      case 0x06: {
        pos++;
        pos += 20;
        const n = bytes[pos++];
        pos += n;
        return null;
      }
      case 0x07:
        return read();
      case 0x08:
        return read();
      case 0x09:
        return null;
      case 0x0a:
        return read();
      case 0x0b: {
        const c = readU32();
        pos += c;
        return null;
      }
      case 0x0c: {
        const c = readU32();
        const o: Record<string, any> = {};
        for (let i = 0; i < c; i++) {
          const kl = bytes[pos++];
          const k = new TextDecoder().decode(
            new Uint8Array(bytes.slice(pos, pos + kl))
          );
          pos += kl;
          o[k] = read();
        }
        return o;
      }
      case 0x0d: {
        const len = readU32();
        pos += len;
        return null;
      }
      default:
        throw new Error(`Unknown clarity 0x${t.toString(16)} @ ${pos - 1}`);
    }
  }

  return read();
}

function decodeClarityUint(hex: string): bigint {
  const v = decodeClarity(hex);
  if (typeof v === "bigint") return v;
  if (v && typeof v === "object" && typeof v.value === "bigint") return v.value;
  throw new Error(`Expected uint, got ${typeof v}`);
}

// ─── On-chain price loading ─────────────────────────────────────────────────

function normalizePyth(price: bigint, expo: number): bigint {
  const adj = expo + 8;
  if (adj === 0) return price;
  if (adj > 0) return price * BigInt(10 ** adj);
  return price / BigInt(10 ** -adj);
}

function encodeStringAscii(s: string): string {
  const b = Array.from(new TextEncoder().encode(s));
  const lenHex = b.length.toString(16).padStart(8, "0");
  const body = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return "0x0d" + lenHex + body;
}

async function hiroCallRead(
  addr: string,
  contract: string,
  fn: string,
  args: string[] = []
): Promise<any> {
  const url = `${HIRO}/v2/contracts/call-read/${addr}/${contract}/${fn}`;
  const res: any = await httpPost(url, {
    sender: `${addr}.${contract}`,
    arguments: args,
  });
  if (!res.okay || !res.result)
    throw new Error(`hiro call-read ${fn}: ${res.cause ?? "unknown"}`);
  return decodeClarity(res.result);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 3000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (i < retries - 1) {
        await sleep(baseDelay * (i + 1));
      } else {
        throw e;
      }
    }
  }
  throw new Error("unreachable");
}

async function loadPrices(timestamp: number): Promise<Record<string, bigint>> {
  const query = Object.values(PYTH_IDS)
    .map((id) => `ids[]=${id}`)
    .join("&");
  const pythData: any = await withRetry(() =>
    httpGet(`${PYTH_URL}/${timestamp}?${query}`)
  );

  const pyth: Record<string, bigint> = {};
  for (const item of pythData.parsed || []) {
    pyth["0x" + item.id] = normalizePyth(
      BigInt(item.price.price),
      Number(item.price.expo)
    );
  }
  const STX = pyth[PYTH_IDS.STX] ?? 0n;
  const BTC = pyth[PYTH_IDS.BTC] ?? 0n;
  const USDC = pyth[PYTH_IDS.USDC] ?? PRICE_PRECISION;

  let USDH = PRICE_PRECISION;
  try {
    const [a, c] = DIA_ORACLE.split(".");
    const diaResult = await hiroCallRead(a, c, "get-value", [
      encodeStringAscii("USDh/USD"),
    ]);
    if (typeof diaResult === "object" && diaResult !== null) {
      const val = diaResult.value;
      if (typeof val === "bigint") USDH = val;
    }
  } catch {}

  let stStxRatio = STSTX_RATIO_DEC;
  try {
    const [a, c] = STSTX_RATIO.split(".");
    const r = await hiroCallRead(a, c, "get-ststx-ratio-v3", []);
    if (typeof r === "bigint") stStxRatio = r;
  } catch {}

  return {
    STX,
    sBTC: BTC,
    stSTX: (STX * stStxRatio) / STSTX_RATIO_DEC,
    USDC,
    USDH,
    stSTXbtc: STX,
  };
}

// ─── Vault ratio reading ────────────────────────────────────────────────────

function encodeUint128(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

async function getSharesToAssets(vault: VaultMeta): Promise<number> {
  const [contractAddr, contractName] = vault.vaultContract.split(".");
  const unitArg = encodeUint128(10 ** vault.underlyingDecimals);
  const url = `${HIRO}/v2/contracts/call-read/${contractAddr}/${contractName}/convert-to-assets`;
  const res: any = await httpPost(url, {
    sender: DEPLOYER,
    arguments: [unitArg],
  });
  if (!res.okay || !res.result)
    throw new Error(
      `Hiro call-read failed for ${vault.key}: ${JSON.stringify(res)}`
    );
  return Number(decodeClarityUint(res.result));
}

// Reserve factor in basis points (10000 = 100%). e.g. 1000 = 10% to protocol.
const BPS_ONE = 10000n;

async function getReserveFactorBps(vault: VaultMeta): Promise<bigint> {
  const [contractAddr, contractName] = vault.vaultContract.split(".");
  const url = `${HIRO}/v2/contracts/call-read/${contractAddr}/${contractName}/get-fee-reserve`;
  const res: any = await httpPost(url, {
    sender: DEPLOYER,
    arguments: [],
  });
  if (!res.okay || !res.result)
    throw new Error(
      `Hiro get-fee-reserve failed for ${vault.key}: ${JSON.stringify(res)}`
    );
  return decodeClarityUint(res.result);
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [prices, ratioEntries, factorEntries] = await Promise.all([
    loadPrices(options.endTimestamp),
    Promise.all(
      VAULTS.map(async (v) => {
        try {
          return [v.key, await getSharesToAssets(v)] as [string, number];
        } catch {
          return [v.key, 0] as [string, number];
        }
      })
    ),
    Promise.all(
      VAULTS.map(async (v) => {
        try {
          return [v.key, await getReserveFactorBps(v)] as [string, bigint];
        } catch {
          return [v.key, 0n] as [string, bigint];
        }
      })
    ),
  ]);
  const ratios = new Map<string, number>(ratioEntries);
  const factors = new Map<string, bigint>(factorEntries);

  // Splits a protocol-side USD amount into gross + supplier using the vault's
  // reserve factor (bps). If the factor is missing or non-positive, treat the
  // protocol share as the gross — never undercount fees — and emit zero
  // supplier-side revenue for that row.
  const splitByVault = (protocolUsd: number, vaultKey: string) => {
    const f = factors.get(vaultKey);
    if (!f || f <= 0n) return { grossUsd: protocolUsd, supplierUsd: 0 };
    const grossUsd = protocolUsd * Number(BPS_ONE) / Number(f);
    return { grossUsd, supplierUsd: grossUsd - protocolUsd };
  };

  const recordVault = (vaultKey: string, protocolUsd: number) => {
    if (protocolUsd <= 0) return;
    const { grossUsd, supplierUsd } = splitByVault(protocolUsd, vaultKey);
    dailyFees.addUSDValue(grossUsd, METRIC.BORROW_INTEREST);
    dailyRevenue.addUSDValue(protocolUsd, METRIC.BORROW_INTEREST);
    if (supplierUsd > 0) {
      dailySupplySideRevenue.addUSDValue(supplierUsd, METRIC.BORROW_INTEREST);
    }
  };

  const rows: {
    kind: string;
    asset_identifier: string | null;
    asset_event_type: string;
    amount: string;
  }[] = await queryAllium(`
    WITH ft_inflows AS (
      SELECT
        'ft' AS kind,
        e.event_contents:asset:asset_id::string         AS asset_identifier,
        e.event_contents:asset:asset_event_type::string AS asset_event_type,
        e.event_contents:asset:amount::string           AS amount
      FROM stacks.raw.events e
      JOIN stacks.raw.transactions t ON e.tx_id = t.tx_id
      WHERE e.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND e.burn_block_time <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.tx_status = 'success'
        AND t.canonical
        AND e.event_type = 'fungible_token_asset'
        AND e.event_contents:asset:recipient::string = '${TREASURY}'
        AND (
          (e.event_contents:asset:asset_event_type::string = 'mint'
           AND e.event_contents:asset:asset_id::string IN (${ZTOKEN_ASSET_IDS}))
          OR
          (e.event_contents:asset:asset_event_type::string = 'transfer'
           AND e.event_contents:asset:sender::string IN (${VAULT_CONTRACTS}))
        )
    ),
    stx_inflows AS (
      SELECT
        'stx' AS kind,
        NULL AS asset_identifier,
        'transfer' AS asset_event_type,
        e.event_contents:asset:amount::string AS amount
      FROM stacks.raw.events e
      JOIN stacks.raw.transactions t ON e.tx_id = t.tx_id
      WHERE e.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND e.burn_block_time <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.tx_status = 'success'
        AND t.canonical
        AND e.event_type = 'stx_asset'
        AND e.event_contents:asset:asset_event_type::string = 'transfer'
        AND e.event_contents:asset:recipient::string = '${TREASURY}'
        AND e.event_contents:asset:sender::string IN (${VAULT_CONTRACTS})
    )
    SELECT kind, asset_identifier, asset_event_type, SUM(amount::number) AS amount
    FROM (SELECT * FROM ft_inflows UNION ALL SELECT * FROM stx_inflows)
    GROUP BY kind, asset_identifier, asset_event_type
  `);

  for (const row of rows) {
    const amount = BigInt(row.amount);

    if (row.kind === "stx") {
      const price = prices.STX ?? 0n;
      if (price > 0n) {
        const usd =
          Number((amount * price) / BigInt(1e6)) / Number(PRICE_PRECISION);
        recordVault("stx", usd);
      }
      continue;
    }

    const z = VAULTS.find((v) => v.ztokenAssetId === row.asset_identifier);
    if (z) {
      const sharesToAssets = ratios.get(z.key);
      if (!sharesToAssets) continue;
      const decScale = BigInt(10 ** z.underlyingDecimals);
      const underlyingAmt =
        (amount * BigInt(sharesToAssets)) / decScale;
      const price = prices[z.underlyingSymbol] ?? 0n;
      if (price > 0n) {
        const usd =
          Number((underlyingAmt * price) / decScale) /
          Number(PRICE_PRECISION);
        recordVault(z.key, usd);
      }
      continue;
    }

    const u = VAULTS.find((v) => v.underlyingFtAssetId === row.asset_identifier);
    if (u) {
      const price = prices[u.underlyingSymbol] ?? 0n;
      if (price > 0n) {
        const usd =
          Number((amount * price) / BigInt(10 ** u.underlyingDecimals)) /
          Number(PRICE_PRECISION);
        recordVault(u.key, usd);
      }
      continue;
    }

    console.warn(
      `[zest-v2 fees] unknown FT into treasury: ${row.asset_identifier}`
    );
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Gross borrower interest paid across all Zest V2 vaults, derived by inverting each vault's reserve-factor (bps) against the protocol's share landing in dao-treasury: gross = protocol_share * 10000 / reserve_factor_bps. Prices sourced on-chain via Pyth (STX, BTC, USDC), DIA oracle (USDh), and Stacking DAO stSTX ratio.",
  Revenue:
    "Protocol's share of borrower interest: ztoken mints to dao-treasury (reserve accruals) plus FT and STX transfers to dao-treasury from vault contracts (realized fees). ztoken amounts converted to underlying via vault convert-to-assets.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue:
    "Lenders' share of borrower interest, computed per vault as gross interest minus the protocol's dao-treasury inflow.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Gross borrower interest across all vaults.",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Protocol's share of borrower interest accruing to dao-treasury across all vaults.",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "Protocol's share of borrower interest accruing to dao-treasury across all vaults.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Lenders' share of borrower interest across all vaults.",
  },
};

const adapter: Adapter = {
  version: 1, // rate limited
  fetch,
  chains: [CHAIN.STACKS],
  start: "2026-01-28",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
