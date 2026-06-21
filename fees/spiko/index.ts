// https://docs.spiko.xyz/spiko-mmfs/fees
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { METRIC } from "../../helpers/metrics";
import { httpPost } from "../../utils/fetchURL";

const ORACLE_PRICE_ABI =
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)";
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const ORACLE_DECIMALS = 6;
const TOKEN_DECIMALS = 5;

// NAV per share is identical across chains for a given fund, but Spiko's per-chain
// oracles drift out of sync — the Ethereum feeds froze in Jan 2025 and Etherlink lags
// by weeks — so NAV is always read from the canonical, live Polygon oracle for every chain.
const NAV_CHAIN = CHAIN.POLYGON;

type Fund = { asset: string; oracle: string; managementFeeRate: number };

// Polygon oracle addresses (canonical NAV source), the coingecko id of each fund's quote
// currency (USTBL/SPKCC = USD, EUTBL/eurSPKCC = EUR), and the annual management fee rate.
// The T-bill funds (USTBL/EUTBL) charge a flat 0.25%. The Cash & Carry funds (SPKCC/eurSPKCC)
// charge 0.10% management PLUS a 25% performance fee above the risk-free rate (SOFR) — the
// performance fee is not captured here because it needs the fund's gross return, which is not
// published on-chain (only the net NAV is).
const FUNDS: Record<string, Fund> = {
  USTBL: { asset: "usd-coin", oracle: "0x021289588cd81dC1AC87ea91e91607eEF68303F5", managementFeeRate: 0.25 / 100 },
  EUTBL: { asset: "euro-coin", oracle: "0x29503f31B73F0734455942Eb888E13acA1588a4e", managementFeeRate: 0.25 / 100 },
  SPKCC: { asset: "usd-coin", oracle: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59", managementFeeRate: 0.10 / 100 },
  eurSPKCC: { asset: "euro-coin", oracle: "0x3868D4e336d14D38031cf680329d31e4712e11cC", managementFeeRate: 0.10 / 100 },
};

// Per-chain token (share) addresses for each fund. Addresses differ per chain.
const TOKENS: Record<string, Record<string, string>> = {
  [CHAIN.ETHEREUM]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59",
    eurSPKCC: "0x3868D4e336d14D38031cf680329d31e4712e11cC",
  },
  [CHAIN.POLYGON]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0x903d5990119bC799423e9C25c56518Ba7DD19474",
    eurSPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
  },
  [CHAIN.ARBITRUM]: {
    USTBL: "0x021289588cd81dC1AC87ea91e91607eEF68303F5",
    EUTBL: "0xCBeb19549054CC0a6257A77736FC78C367216cE7",
    SPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
    eurSPKCC: "0x0e389C83Bc1d16d86412476F6103027555C03265",
  },
  [CHAIN.BASE]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0xf695Df6c0f3bB45918A7A82e83348FC59517734E",
    eurSPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
  },
  [CHAIN.ETHERLINK]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59",
    eurSPKCC: "0x3868D4e336d14D38031cf680329d31e4712e11cC",
  },
};

// Stellar (Soroban) and Starknet have no on-chain reader in this repo and only retain
// recent state over RPC, so their supply is read at the latest ledger/block (not the
// historical period boundary). NAV still comes from the canonical Polygon oracle above.
const STELLAR_TOKENS: Record<string, string> = {
  USTBL: "CARUUX2FZNPH6DGJOEUFSIUQWYHNL5AVDV7PMVSHWL7OBYIBFC76F4TO",
  EUTBL: "CBGV2QFQBBGEQRUKUMCPO3SZOHDDYO6SCP5CH6TW7EALKVHCXTMWDDOF",
  SPKCC: "CDS2GCAQTNQINSCJUJIVBJXILKBWP5PU7LOBGHMP3X47QCQBFKPMTCNT",
  eurSPKCC: "CDWOB6T7SVSMMQN5V3P2OPTBAXOP7DAZHGVW3PYTZIKHVFKN6TBSXR6A",
};

const STARKNET_TOKENS: Record<string, string> = {
  USTBL: "0x020ff2f6021ada9edbceaf31b96f9f67b746662a6e6b2bc9d30c0d3e290a71f6",
  EUTBL: "0x04f5e0de717daa6aa8de63b1bf2e8d7823ec5b21a88461b1519d9dbc956fb7f2",
  SPKCC: "0x04bade88e79a6120f893d64e51006ac6853eceeefa1a50868d19601b1f0a567d",
  eurSPKCC: "0x06472cabc51a3805975b9c60c7dec63897c9a287f2db173a1d6c589d18dd1e07",
};

const STELLAR_RPC = "https://soroban-rpc.creit.tech/";
const STARKNET_RPC = "https://rpc.starknet.lava.build";
const STARKNET_TOTAL_SUPPLY_SELECTOR =
  "0x01557182e4359a1f0c6301278e8f5b35a776ab58d39892581e357578fb287836";

// Minimal RFC4648 base32 decode (Stellar StrKey alphabet)
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "")) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// A Stellar contract StrKey is a version byte + 32-byte id + 2-byte CRC, base32-encoded.
function decodeContractId(strKey: string): Buffer {
  return base32Decode(strKey).slice(1, -2);
}

// Soroban ledger key for a contract's instance storage (where TotalSupply lives).
function buildContractInstanceKey(contract: string): string {
  const id = decodeContractId(contract);
  const buf = Buffer.alloc(48);
  buf.writeUInt32BE(6, 0); // CONTRACT_DATA
  buf.writeUInt32BE(1, 4); // SC_ADDRESS_TYPE_CONTRACT
  id.copy(buf, 8);
  buf.writeUInt32BE(20, 40); // SCV_LEDGER_KEY_CONTRACT_INSTANCE
  buf.writeUInt32BE(1, 44); // CONTRACT_DATA_PERSISTENT
  return buf.toString("base64");
}

function parseTotalSupply(xdr: string): bigint {
  const buf = Buffer.from(xdr, "base64");
  const idx = buf.indexOf(Buffer.from("TotalSupply"));
  if (idx === -1) throw new Error("TotalSupply not found in contract storage");
  const len = buf.readUInt32BE(idx - 4);
  let offset = idx + len;
  offset += (4 - (len % 4)) % 4;
  const type = buf.readUInt32BE(offset);
  if (type !== 10) throw new Error("Unexpected TotalSupply ScVal type");
  const hi = buf.readBigInt64BE(offset + 4);
  const lo = buf.readBigUInt64BE(offset + 12);
  return hi < 0n ? -(((-hi) << 64n) - lo) : (hi << 64n) + lo;
}

async function getStellarSupply(contract: string): Promise<number> {
  const res = await httpPost(STELLAR_RPC, {
    jsonrpc: "2.0",
    id: 1,
    method: "getLedgerEntries",
    params: { keys: [buildContractInstanceKey(contract)] },
  });
  const xdr = res?.result?.entries?.[0]?.xdr;
  if (!xdr) throw new Error(`Missing Soroban contract data for ${contract}`);
  return Number(parseTotalSupply(xdr)) / 10 ** TOKEN_DECIMALS;
}

async function getStarknetSupply(contract: string): Promise<number> {
  const res = await httpPost(STARKNET_RPC, {
    jsonrpc: "2.0",
    id: 1,
    method: "starknet_call",
    params: [
      { contract_address: contract, entry_point_selector: STARKNET_TOTAL_SUPPLY_SELECTOR, calldata: [] },
      "latest",
    ],
  });
  const result = res?.result;
  if (!result) throw new Error(`Starknet totalSupply call failed for ${contract}`);
  const [low, high] = result; // u256 (low, high)
  const supply = BigInt(low) + (BigInt(high ?? 0) << 128n);
  return Number(supply) / 10 ** TOKEN_DECIMALS;
}

// Resolve each fund's token supply (in whole shares) for the given chain.
async function getSupplies(options: FetchOptions): Promise<Record<string, number>> {
  const { chain } = options;
  const out: Record<string, number> = {};

  if (chain === CHAIN.STELLAR || chain === CHAIN.STARKNET) {
    const tokenMap = chain === CHAIN.STELLAR ? STELLAR_TOKENS : STARKNET_TOKENS;
    const read = chain === CHAIN.STELLAR ? getStellarSupply : getStarknetSupply;
    await Promise.all(
      Object.entries(tokenMap).map(async ([fund, contract]) => {
        const supply = await read(contract).catch(() => undefined);
        if (supply !== undefined) out[fund] = supply;
      })
    );
    return out;
  }

  const tokenMap = TOKENS[chain];
  const fundKeys = Object.keys(tokenMap);
  const totalSupplies = await options.toApi.multiCall({
    calls: fundKeys.map((f) => tokenMap[f]),
    abi: "erc20:totalSupply",
    permitFailure: true,
  });
  fundKeys.forEach((fund, i) => {
    if (totalSupplies[i]) out[fund] = Number(totalSupplies[i]) / 10 ** TOKEN_DECIMALS;
  });
  return out;
}

// NAV is the same for every chain, so resolve it once per period (keyed by from/to) and
// reuse it across all chain fetches in the same run.
const navCache: Record<string, Promise<Record<string, { before: number; after: number }>>> = {};

async function getNavChanges(options: FetchOptions) {
  const key = `${options.fromTimestamp}-${options.toTimestamp}`;
  if (!navCache[key]) {
    navCache[key] = (async () => {
      const fundKeys = Object.keys(FUNDS);
      const oracles = fundKeys.map((f) => FUNDS[f].oracle);
      const [blockBefore, blockAfter] = await Promise.all([
        getBlock(options.fromTimestamp, NAV_CHAIN, {}),
        getBlock(options.toTimestamp, NAV_CHAIN, {}),
      ]);
      const apiBefore = new sdk.ChainApi({ chain: NAV_CHAIN, block: blockBefore });
      const apiAfter = new sdk.ChainApi({ chain: NAV_CHAIN, block: blockAfter });
      const [before, after] = await Promise.all([
        apiBefore.multiCall({ calls: oracles, abi: ORACLE_PRICE_ABI, permitFailure: true }),
        apiAfter.multiCall({ calls: oracles, abi: ORACLE_PRICE_ABI, permitFailure: true }),
      ]);
      const out: Record<string, { before: number; after: number }> = {};
      fundKeys.forEach((fund, i) => {
        if (!before[i] || !after[i]) return;
        out[fund] = {
          before: Number(before[i].answer) / 10 ** ORACLE_DECIMALS,
          after: Number(after[i].answer) / 10 ** ORACLE_DECIMALS,
        };
      });
      return out;
    })();
  }
  return navCache[key];
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { createBalances, fromTimestamp, toTimestamp } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [navChanges, supplies] = await Promise.all([
    getNavChanges(options),
    getSupplies(options),
  ]);

  const periodInYears = (toTimestamp - fromTimestamp) / YEAR_IN_SECONDS;

  for (const [fund, supply] of Object.entries(supplies)) {
    const nav = navChanges[fund];
    if (!nav) continue;
    const { asset, managementFeeRate } = FUNDS[fund];

    // NAV growth distributed to token holders (the fund's net yield).
    const assetYield = Math.max(0, supply * (nav.after - nav.before));
    dailyFees.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);

    // Annual management fee, charged on assets under management (supply x NAV).
    const managementFee = supply * nav.after * managementFeeRate * periodInYears;
    dailyFees.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
    dailyRevenue.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Net NAV growth from Spiko funds (USTBL/EUTBL/SPKCC/eurSPKCC) distributed to holders, plus Spiko's annual management fee. The published NAV is already net of fees, so the management fee is added on top to reconstruct gross fees.",
  Revenue: "Spiko management fees on assets under management: 0.25%/yr for the T-bill funds (USTBL/EUTBL) and 0.10%/yr for the Cash & Carry funds (SPKCC/eurSPKCC). The Cash & Carry funds also charge a 25% performance fee above the risk-free rate (SOFR) that is not captured, since only the net NAV is published on-chain.",
  ProtocolRevenue: "Same as Revenue — all management fees accrue to Spiko.",
  SupplySideRevenue: "Net NAV growth from Spiko fund asset yields, distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Net fund NAV growth read from Spiko's canonical on-chain oracle.",
    [METRIC.MANAGEMENT_FEES]: "Annual management fee on assets under management: 0.25% for USTBL/EUTBL, 0.10% for SPKCC/eurSPKCC.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Annual management fee on assets under management: 0.25% for USTBL/EUTBL, 0.10% for SPKCC/eurSPKCC.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Annual management fee on assets under management: 0.25% for USTBL/EUTBL, 0.10% for SPKCC/eurSPKCC.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Net fund NAV growth distributed to token holders.",
  },
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-05-01' },
    [CHAIN.POLYGON]: { start: '2024-04-20' },
    [CHAIN.ARBITRUM]: { start: '2024-10-25' },
    [CHAIN.BASE]: { start: '2025-02-12' },
    [CHAIN.ETHERLINK]: { start: '2025-02-12' },
    [CHAIN.STARKNET]: { start: '2024-11-26' },
    [CHAIN.STELLAR]: { start: '2025-10-01' },
  },
};

export default adapter;
