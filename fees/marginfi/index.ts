import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";
import { sleep } from "../../utils/utils";
import { encodeBase58 } from "ethers";
import { METRIC } from "../../helpers/metrics";

const MARGINFI_PROGRAM = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";
// The main lending group. Other groups are isolated third party markets.
const MAIN_GROUP = "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";

// Anchor discriminator for the Bank account, sha256("account:Bank")[..8].
const BANK_DISCRIMINATOR = "QnTef4UXSzF";

const YEAR = 365 * 24 * 60 * 60;

// Byte offsets into the Bank account. Everything up to `config` has been stable
// across marginfi IDL versions 0.1.4 to 0.1.8; `cache` was added later and sits
// after the config block.
const OFF = {
  mint: 8,
  mintDecimals: 40,
  assetShareValue: 80,
  liabilityShareValue: 96,
  totalLiabilityShares: 256,
  totalAssetShares: 272,
  // BankCache: base_rate, lending_rate, borrowing_rate are consecutive u32s.
  lendingRate: 1380,
  borrowingRate: 1384,
};

// Rates are u32 fractions of u32::MAX, where the full range spans 1000% APR.
// Verified against the banks' own accrued interest: dividing
// `accumulated_since_last_update` by borrows over `interest_accumulated_for`
// seconds reproduces this scale and not a plain 1e8 one.
const U32_MAX = 4294967295;
const MAX_RATE = 10;
const toApr = (raw: number) => (raw / U32_MAX) * MAX_RATE;

// WrappedI80F48 is a little endian i128 with 48 fractional bits.
function readI80F48(buf: Buffer, offset: number): number {
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigInt64LE(offset + 8);
  return Number((hi << 64n) + BigInt(lo)) / 2 ** 48;
}

async function getBanks(): Promise<Buffer[]> {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "getProgramAccounts",
    params: [
      MARGINFI_PROGRAM,
      {
        encoding: "base64",
        filters: [
          { memcmp: { offset: 0, bytes: BANK_DISCRIMINATOR } },
          { memcmp: { offset: 41, bytes: MAIN_GROUP } },
        ],
      },
    ],
  };

  // Public Solana endpoints rate limit this call, so back off rather than
  // reporting a short day.
  let lastError: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await httpPost(getEnv("SOLANA_RPC"), payload);
      if (!Array.isArray(response?.result))
        throw new Error(`marginfi: getProgramAccounts failed: ${JSON.stringify(response).slice(0, 300)}`);
      return response.result.map((account: any) => Buffer.from(account.account.data[0], "base64"));
    } catch (e: any) {
      lastError = e;
      const status = e?.statusCode || e?.response?.status;
      if (status !== 429 && !/429|timeout|ECONN|ETIMEDOUT/i.test(e?.message ?? "")) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const banks = await getBanks();
  if (!banks.length) throw new Error("marginfi: no banks returned for the main group");

  const elapsed = options.endTimestamp - options.startTimestamp;

  for (const bank of banks) {
    const mint = encodeBase58(new Uint8Array(bank.slice(OFF.mint, OFF.mint + 32)));

    // Shares are converted to token units by the bank's own share values, which
    // are the interest accrual indices.
    const borrowed = readI80F48(bank, OFF.totalLiabilityShares) * readI80F48(bank, OFF.liabilityShareValue);
    const deposited = readI80F48(bank, OFF.totalAssetShares) * readI80F48(bank, OFF.assetShareValue);
    if (!(borrowed > 0) || !isFinite(borrowed) || !isFinite(deposited)) continue;

    const borrowingRate = toApr(bank.readUInt32LE(OFF.borrowingRate));
    const lendingRate = toApr(bank.readUInt32LE(OFF.lendingRate));

    // Interest paid by borrowers is the fee; the part of it that reaches
    // depositors is supply side, and marginfi keeps the spread.
    dailyFees.add(mint, (borrowed * borrowingRate * elapsed) / YEAR, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(mint, (deposited * lendingRate * elapsed) / YEAR, METRIC.BORROW_INTEREST);
  }

  const dailyRevenue = dailyFees.clone(1, METRIC.BORROW_INTEREST);
  dailyRevenue.subtract(dailySupplySideRevenue, METRIC.BORROW_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Rates are read live from each bank, so the window can be any length.
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
  methodology: {
    Fees: "Interest paid by borrowers across every bank in the marginfi main lending group.",
    Revenue: "The spread marginfi keeps, the interest borrowers pay less the interest credited to depositors.",
    ProtocolRevenue: "The spread marginfi keeps, the interest borrowers pay less the interest credited to depositors.",
    SupplySideRevenue: "Interest credited to depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Total borrows on each bank multiplied by that bank's borrowing rate.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Borrower interest less depositor interest, which is the insurance and protocol fee share of the rate.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Borrower interest less depositor interest, which is the insurance and protocol fee share of the rate.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Total deposits on each bank multiplied by that bank's lending rate.",
    },
  },
};

export default adapter;
