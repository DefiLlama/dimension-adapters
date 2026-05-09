import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const APTOS_REST_API = "https://api.mainnet.aptoslabs.com";
const MOVE_DOLLAR_ADDRESS = "0x6f986d146e4a90b828d8c12c14b6f4e003fdff11a8eecceceb63744363eaac01";
const FIXED_POINT_64 = 1n << 64n;
const MOD_DECIMALS = 100_000_000n;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const USD_SCALE = 1_000_000n;

interface AptosResource {
  type: string;
  data: any;
}

const extractCollateral = (type: string, resource: string) =>
  type.match(new RegExp(`${MOVE_DOLLAR_ADDRESS}::vault::${resource}<(.+)>$`))?.[1];

const parseAptosInteger = (value: unknown, field: string, type: string): bigint => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${field} in ${type}: expected decimal string, got ${JSON.stringify(value)}`);
  }
  return BigInt(value);
};

const getVersionAtTimestamp = async (timestamp: number): Promise<number> => {
  const ledger = await httpGet(`${APTOS_REST_API}/v1`);
  const targetMicros = timestamp * 1e6;
  if (Number(ledger.ledger_timestamp) <= targetMicros) return Number(ledger.ledger_version);

  let low = Number(ledger.oldest_ledger_version ?? 0);
  let high = Number(ledger.ledger_version);

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const block = await httpGet(`${APTOS_REST_API}/v1/blocks/by_version/${mid}`);
    if (Number(block.block_timestamp) <= targetMicros) low = Number(block.last_version);
    else high = Number(block.first_version) - 1;
  }
  return low;
};

const fetch = async (options: FetchOptions) => {
  const ledgerVersion = await getVersionAtTimestamp(options.toTimestamp);
  const resources: AptosResource[] = await httpGet(
    `${APTOS_REST_API}/v1/accounts/${MOVE_DOLLAR_ADDRESS}/resources?ledger_version=${ledgerVersion}&limit=9999`
  );

  const liabilities: Record<string, bigint> = {};
  const annualRates: Record<string, bigint> = {};

  for (const { type, data } of resources) {
    const vaultCollateral = extractCollateral(type, "Vaults");
    if (vaultCollateral) {
      if (data.total_liability == null) throw new Error(`Missing total_liability in ${type}`);
      liabilities[vaultCollateral] = parseAptosInteger(data.total_liability, "total_liability", type);
    }

    const paramsCollateral = extractCollateral(type, "VaultCollateralParams");
    if (paramsCollateral) {
      if (data.interest_annual_rate_ratio?.v == null) throw new Error(`Missing interest_annual_rate_ratio.v in ${type}`);
      annualRates[paramsCollateral] = parseAptosInteger(data.interest_annual_rate_ratio.v, "interest_annual_rate_ratio.v", type);
    }
  }

  const windowSeconds = options.endTimestamp - options.startTimestamp;
  let feesScaled = 0n;

  for (const [collateral, liability] of Object.entries(liabilities)) {
    const annualRate = annualRates[collateral];
    if (annualRate === undefined) throw new Error(`Missing annual interest rate for collateral: ${collateral}`);
    feesScaled += liability * annualRate * BigInt(windowSeconds) * USD_SCALE
      / MOD_DECIMALS / FIXED_POINT_64 / BigInt(YEAR_SECONDS);
  }

  const feesUsd = Number(feesScaled) / Number(USD_SCALE);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(feesUsd);
  dailyRevenue.addUSDValue(feesUsd);

  return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2023-04-05",
    },
  },
  methodology: {
    Fees: "Borrow interest accrued on Move Dollar (MOD) CDP vaults, computed from on-chain liabilities and annual interest rates.",
    Revenue: "100% of borrow interest is retained by the Thala protocol (no external lenders).",
  },
};

export default adapter;
