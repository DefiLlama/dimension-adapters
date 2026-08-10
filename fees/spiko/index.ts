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

// NAV priced to USD via a coingecko stablecoin (`asset`, USD/EUR funds) or an FX feed (`fx`,
// GBP/CHF funds). `oracleChain` is where the NAV feed lives (defaults to Polygon; SAFO on Arbitrum).
type Fund = { asset?: string; fx?: string; oracle: string; oracleChain?: string; managementFeeRate: number };

// Management fee: 0.25% for the T-bill funds, 0.10% for the Cash & Carry funds (which also charge a
// 25% SOFR performance fee not captured here — only net NAV is on-chain). SAFO fee assumed 0.25%.
const FUNDS: Record<string, Fund> = {
  USTBL: { asset: "usd-coin", oracle: "0x021289588cd81dC1AC87ea91e91607eEF68303F5", managementFeeRate: 0.25 / 100 },
  EUTBL: { asset: "euro-coin", oracle: "0x29503f31B73F0734455942Eb888E13acA1588a4e", managementFeeRate: 0.25 / 100 },
  UKTBL: { fx: "GBP", oracle: "0xf695Df6c0f3bB45918A7A82e83348FC59517734E", managementFeeRate: 0.25 / 100 },
  SPKCC: { asset: "usd-coin", oracle: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59", managementFeeRate: 0.10 / 100 },
  eurSPKCC: { asset: "euro-coin", oracle: "0x3868D4e336d14D38031cf680329d31e4712e11cC", managementFeeRate: 0.10 / 100 },
  SAFO: { asset: "usd-coin", oracle: "0x372e37cA79747A2d1671EDBC5f1e2853B96BA351", oracleChain: CHAIN.ARBITRUM, managementFeeRate: 0.25 / 100 },
  eurSAFO: { asset: "euro-coin", oracle: "0x385D443ffA5b6Fb462b988D023a5DC3b37Ef1644", oracleChain: CHAIN.ARBITRUM, managementFeeRate: 0.25 / 100 },
  gbpSAFO: { fx: "GBP", oracle: "0x835B48E97CBF727e23E7AA3bD40248818d20A2b0", oracleChain: CHAIN.ARBITRUM, managementFeeRate: 0.25 / 100 },
  chfSAFO: { fx: "CHF", oracle: "0xD1F12049cC311DfB177f168046Ed8e2bd341a7AF", oracleChain: CHAIN.ARBITRUM, managementFeeRate: 0.25 / 100 },
};

// Chainlink FX feeds (Polygon, 8 decimals) converting GBP/CHF fund NAVs to USD (no stablecoin
// tracks these currencies). An FX rate is chain-agnostic, so Polygon feeds are fine everywhere.
const FX_FEED_CHAIN = CHAIN.POLYGON;
const FX_DECIMALS = 8;
const FX_FEEDS: Record<string, string> = {
  GBP: "0x099a2540848573e94fb1Ca0Fa420b00acbBc845a", // GBP/USD
  CHF: "0xc76f762CedF0F78a439727861628E0fdfE1e70c2", // CHF/USD
};

// Per-chain token (share) addresses for each fund. Addresses differ per chain.
const TOKENS: Record<string, Record<string, string>> = {
  [CHAIN.ETHEREUM]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    UKTBL: "0xf695Df6c0f3bB45918A7A82e83348FC59517734E",
    SPKCC: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59",
    eurSPKCC: "0x3868D4e336d14D38031cf680329d31e4712e11cC",
    SAFO: "0xcBaDe7D9BdEe88411CB6cbCbB29952b742036992",
    eurSAFO: "0x0990b149e915cb08e2143a5c6f669c907eddc8b0",
    gbpSAFO: "0xC273986a91e4BFC543610a5cb5860b7Cfefb6cC0",
    chfSAFO: "0x18b5c15e5196a38a162b1787875295b76e4313fb",
  },
  [CHAIN.POLYGON]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    UKTBL: "0x970E2aDC2fdF53AEa6B5fa73ca6dc30eAFEDfe3D",
    SPKCC: "0x903d5990119bC799423e9C25c56518Ba7DD19474",
    eurSPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
    SAFO: "0x6F64f47F95cf656f21B40E14798F6b49f80b3dc5",
    eurSAFO: "0x272ea767712cc4839f4a27ee35eb73116158c8a2",
    gbpSAFO: "0x4fe515c67eeeadb3282780325f09bb7c244fe774",
    chfSAFO: "0x9de2b2dcdcf43540e47143f28484b6d15118f089",
  },
  [CHAIN.ARBITRUM]: {
    USTBL: "0x021289588cd81dC1AC87ea91e91607eEF68303F5",
    EUTBL: "0xCBeb19549054CC0a6257A77736FC78C367216cE7",
    UKTBL: "0x903d5990119bC799423e9C25c56518Ba7DD19474",
    SPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
    eurSPKCC: "0x0e389C83Bc1d16d86412476F6103027555C03265",
    SAFO: "0x0c709396739b9cfb72bcea6ac691ce0ddf66479c",
    eurSAFO: "0x1412632f2b89e87bfa20c1318a43ced25f1d7b76",
    gbpSAFO: "0xbe023308ac2ef7e1c3799f4e6a3003ee6d342635",
    chfSAFO: "0x97e7962bcd091e7ecfb583fc96289b1e1553ac6e",
  },
  [CHAIN.BASE]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    UKTBL: "0xA8De1f55Aa0E381cb456e1DcC9ff781eA0079068",
    SPKCC: "0xf695Df6c0f3bB45918A7A82e83348FC59517734E",
    eurSPKCC: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59",
    SAFO: "0x0bb754d8940e283d9ff6855ab5dafbc14165c059",
    eurSAFO: "0xd879846cbe20751bde8a9342a3cca00a3e56ca47",
    gbpSAFO: "0x2f6c0e5e06b43512706a9cdf66cd21f723fe0ec3",
    chfSAFO: "0xd9aa2300e126869182dfb6ecf54984e4c687f36b",
  },
  [CHAIN.ETHERLINK]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    UKTBL: "0x970E2aDC2fdF53AEa6B5fa73ca6dc30eAFEDfe3D",
    SPKCC: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59",
    eurSPKCC: "0x3868D4e336d14D38031cf680329d31e4712e11cC",
    SAFO: "0x5677a4dc7484762ffccee13cba20b5c979def446",
    eurSAFO: "0x35dfec1813c43d82e6b87c682f560bbb8ea0c121",
    gbpSAFO: "0xfe20ebe3881491b2e158b9d10cb95bcfa652262d",
    chfSAFO: "0xef53e7d17822b641c6481837238a64a688709301",
  },
};

// Stellar (Soroban) and Starknet have no on-chain reader in this repo and only retain
// recent state over RPC, so their supply is read at the latest ledger/block (not the
// historical period boundary). NAV still comes from the canonical Polygon oracle above.
const STELLAR_TOKENS: Record<string, string> = {
  USTBL: "CARUUX2FZNPH6DGJOEUFSIUQWYHNL5AVDV7PMVSHWL7OBYIBFC76F4TO",
  EUTBL: "CBGV2QFQBBGEQRUKUMCPO3SZOHDDYO6SCP5CH6TW7EALKVHCXTMWDDOF",
  UKTBL: "CDT3KU6TQZNOHKNOHNAFFDQZDURVC3MSTL4ML7TUTZGNOPBZCLABP4FR",
  SPKCC: "CDS2GCAQTNQINSCJUJIVBJXILKBWP5PU7LOBGHMP3X47QCQBFKPMTCNT",
  eurSPKCC: "CDWOB6T7SVSMMQN5V3P2OPTBAXOP7DAZHGVW3PYTZIKHVFKN6TBSXR6A",
  SAFO: "CDGSC6BA4TCAOVSFQCUEHDMOIIHYYVNYBT6YEARS4MX3ITAHUINVGQHX",
  eurSAFO: "CBOOCGZSVRSZFRE4U2NWR2B4RXYVJWRCBTGOUD2JPI2TDJPWMTJX7FZP",
  gbpSAFO: "CAGYRRKPFSWKM6SJOE4QAAVYMOSHMDS5WOQ4T5A2E6XNCU7LZZKUNQKP",
  chfSAFO: "CAJD2IBSP7VO2VYJQUYJSOGPJINTUYV7MQITINXVPTIH3CCLCUENNMW4",
};

const STARKNET_TOKENS: Record<string, string> = {
  USTBL: "0x020ff2f6021ada9edbceaf31b96f9f67b746662a6e6b2bc9d30c0d3e290a71f6",
  EUTBL: "0x04f5e0de717daa6aa8de63b1bf2e8d7823ec5b21a88461b1519d9dbc956fb7f2",
  UKTBL: "0x0153d6e0462080bb2842109e9b64f589ef5aa06bb32b26bbdb894aca92674395",
  SPKCC: "0x04bade88e79a6120f893d64e51006ac6853eceeefa1a50868d19601b1f0a567d",
  eurSPKCC: "0x06472cabc51a3805975b9c60c7dec63897c9a287f2db173a1d6c589d18dd1e07",
  SAFO: "0x035bdc17f7a7d09c45d31ab476a576d4f7aad916676b2948fe172c3bcb33725a",
  eurSAFO: "0x0128f41ef8017ab56140ffad6439305a3196ed862841ba61ff4d78e380c346a6",
  gbpSAFO: "0x06e8a99926ff6d56f4cb93c37b63286d736cd1f81740d53f88b4875b4cbe7f49",
  chfSAFO: "0x06723dcb428eddb160c5adfc2d0a5e5adc184bf6a7298780c3cbf3fa764f709b",
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
        const supply = await read(contract).catch((e) => {
          console.log(`Spiko: failed to read ${fund} supply on ${chain}: ${e.message}`);
          return undefined;
        });
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

// NAV (and the FX rates that convert non-USD NAVs to USD) is the same for every chain, so
// resolve it once per period (keyed by from/to) and reuse across all chain fetches in the run.
type NavResult = {
  nav: Record<string, { before: number; after: number }>;
  fx: Record<string, number>;
};
const navCache: Record<string, Promise<NavResult>> = {};

async function getNavChanges(options: FetchOptions): Promise<NavResult> {
  const key = `${options.fromTimestamp}-${options.toTimestamp}`;
  if (!navCache[key]) {
    navCache[key] = (async () => {
      const fundKeys = Object.keys(FUNDS);
      const nav: Record<string, { before: number; after: number }> = {};
      const afterBlocks: Record<string, number> = {};

      // Oracles span chains (most on Polygon, SAFO on Arbitrum), so read them once per chain.
      const oracleChains = [...new Set(fundKeys.map((f) => FUNDS[f].oracleChain ?? NAV_CHAIN))];
      await Promise.all(
        oracleChains.map(async (chain) => {
          const funds = fundKeys.filter((f) => (FUNDS[f].oracleChain ?? NAV_CHAIN) === chain);
          const [blockBefore, blockAfter] = await Promise.all([
            getBlock(options.fromTimestamp, chain, {}),
            getBlock(options.toTimestamp, chain, {}),
          ]);
          // getBlock returns null on failure; reading the oracle at a null block silently
          // falls back to "latest" and corrupts the NAV delta, so fail loudly instead.
          if (!blockBefore || !blockAfter) {
            throw new Error(`Spiko: failed to resolve ${chain} blocks for NAV lookup`);
          }
          afterBlocks[chain] = blockAfter;
          const oracles = funds.map((f) => FUNDS[f].oracle);
          const apiBefore = new sdk.ChainApi({ chain, block: blockBefore });
          const apiAfter = new sdk.ChainApi({ chain, block: blockAfter });
          const [before, after] = await Promise.all([
            apiBefore.multiCall({ calls: oracles, abi: ORACLE_PRICE_ABI, permitFailure: true }),
            apiAfter.multiCall({ calls: oracles, abi: ORACLE_PRICE_ABI, permitFailure: true }),
          ]);
          funds.forEach((fund, i) => {
            if (!before[i] || !after[i]) return;
            nav[fund] = {
              before: Number(before[i].answer) / 10 ** ORACLE_DECIMALS,
              after: Number(after[i].answer) / 10 ** ORACLE_DECIMALS,
            };
          });
        })
      );

      // FX rates for the GBP/CHF funds at the period-end block (Polygon is always an oracle chain).
      const fx: Record<string, number> = {};
      const fxKeys = Object.keys(FX_FEEDS);
      const fxApi = new sdk.ChainApi({ chain: FX_FEED_CHAIN, block: afterBlocks[FX_FEED_CHAIN] });
      const fxAnswers = await fxApi.multiCall({
        calls: fxKeys.map((k) => FX_FEEDS[k]),
        abi: ORACLE_PRICE_ABI,
        permitFailure: true,
      });
      fxKeys.forEach((ccy, i) => {
        if (fxAnswers[i] && Number(fxAnswers[i].answer) > 0) {
          fx[ccy] = Number(fxAnswers[i].answer) / 10 ** FX_DECIMALS;
        }
      });

      return { nav, fx };
    })();
  }
  return navCache[key];
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { createBalances, fromTimestamp, toTimestamp } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [{ nav: navChanges, fx }, supplies] = await Promise.all([
    getNavChanges(options),
    getSupplies(options),
  ]);

  const periodInYears = (toTimestamp - fromTimestamp) / YEAR_IN_SECONDS;

  for (const [fund, supply] of Object.entries(supplies)) {
    const nav = navChanges[fund];
    if (!nav) continue;
    const { asset, fx: fxKey, managementFeeRate } = FUNDS[fund];

    // Skip a GBP/CHF fund with a missing FX rate rather than book its ~1.0 native NAV as USD.
    const fxRate = fxKey ? fx[fxKey] : undefined;
    if (fxKey && fxRate === undefined) continue;

    // Base-currency amounts: NAV growth distributed to holders, and the fee on AUM (supply x NAV).
    const assetYield = Math.max(0, supply * (nav.after - nav.before));
    const managementFee = supply * nav.after * managementFeeRate * periodInYears;

    if (asset) {
      // USD/EUR: price the base-currency amount through its coingecko stablecoin.
      dailyFees.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);
      dailyFees.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
    } else {
      // GBP/CHF: convert the base-currency amount to USD with the on-chain FX rate.
      dailyFees.addUSDValue(assetYield * fxRate!, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.addUSDValue(assetYield * fxRate!, METRIC.ASSETS_YIELDS);
      dailyFees.addUSDValue(managementFee * fxRate!, METRIC.MANAGEMENT_FEES);
      dailyRevenue.addUSDValue(managementFee * fxRate!, METRIC.MANAGEMENT_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Net NAV growth from Spiko funds (USTBL/EUTBL/UKTBL/SPKCC/eurSPKCC and the SAFO Amundi Overnight Swap funds) distributed to holders, plus Spiko's annual management fee. The published NAV is already net of fees, so the management fee is added on top to reconstruct gross fees.",
  Revenue: "Spiko management fees on assets under management: 0.25%/yr for the T-bill funds (USTBL/EUTBL/UKTBL), 0.10%/yr for the Cash & Carry funds (SPKCC/eurSPKCC), and 0.25%/yr for the Amundi Overnight Swap funds (SAFO/eurSAFO/gbpSAFO/chfSAFO). The Cash & Carry funds also charge a 25% performance fee above the risk-free rate (SOFR) that is not captured, since only the net NAV is published on-chain.",
  ProtocolRevenue: "Same as Revenue — all management fees accrue to Spiko.",
  SupplySideRevenue: "Net NAV growth from Spiko fund asset yields, distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Net fund NAV growth read from Spiko's canonical on-chain oracle (non-USD NAVs converted to USD via Chainlink FX feeds).",
    [METRIC.MANAGEMENT_FEES]: "Annual management fee on assets under management: 0.25% for the T-bill funds (USTBL/EUTBL/UKTBL) and the SAFO funds, 0.10% for the Cash & Carry funds (SPKCC/eurSPKCC).",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Annual management fee on assets under management: 0.25% for the T-bill funds (USTBL/EUTBL/UKTBL) and the SAFO funds, 0.10% for the Cash & Carry funds (SPKCC/eurSPKCC).",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Annual management fee on assets under management: 0.25% for the T-bill funds (USTBL/EUTBL/UKTBL) and the SAFO funds, 0.10% for the Cash & Carry funds (SPKCC/eurSPKCC).",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Net fund NAV growth distributed to token holders.",
  },
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  // NAV oracles publish once per day, so hourly granularity adds no signal.
  pullHourly: false,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-05-01' },
    [CHAIN.POLYGON]: { start: '2024-04-20' },
    [CHAIN.ARBITRUM]: { start: '2024-10-25' },
    [CHAIN.BASE]: { start: '2025-02-12' },
    [CHAIN.ETHERLINK]: { start: '2025-02-12' },
    [CHAIN.STARKNET]: { start: '2024-11-26', runAtCurrTime: true },
    [CHAIN.STELLAR]: { start: '2025-10-01', runAtCurrTime: true },
  },
};

export default adapter;
