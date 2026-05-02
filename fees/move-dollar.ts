import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const APTOS_REST_API = "https://api.mainnet.aptoslabs.com";
const MOVE_DOLLAR_ADDRESS = "0x6f986d146e4a90b828d8c12c14b6f4e003fdff11a8eecceceb63744363eaac01";
const FIXED_POINT_64 = 1n << 64n;
const MOD_DECIMALS = 100_000_000n;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const USD_SCALE = 1_000_000n;
const BORROW_INTEREST = "Borrow interest";

interface AptosResource {
  type: string;
  data: any;
}

const extractCollateral = (type: string, resource: string) =>
  type.match(new RegExp(`${MOVE_DOLLAR_ADDRESS}::vault::${resource}<(.+)>$`))?.[1];

const parseAptosInteger = (value: unknown, field: string, type: string) => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${field} for ${type}`);
  }

  return BigInt(value);
};

const getVersionFromTimestamp = async (timestamp: number) => {
  const ledger = await httpGet(`${APTOS_REST_API}/v1`);
  const targetMicros = timestamp * 1e6;
  if (Number(ledger.ledger_timestamp) <= targetMicros) return ledger.ledger_version;

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

const fetchResources = async (timestamp: number) => {
  const ledgerVersion = await getVersionFromTimestamp(timestamp);
  return httpGet(`${APTOS_REST_API}/v1/accounts/${MOVE_DOLLAR_ADDRESS}/resources?ledger_version=${ledgerVersion}&limit=9999`);
};

const fetch = async (timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const resources: AptosResource[] = await fetchResources(timestamp);
  const liabilities: Record<string, bigint> = {};
  const annualRates: Record<string, bigint> = {};

  resources.forEach(({ type, data }) => {
    const vaultCollateral = extractCollateral(type, "Vaults");
    if (vaultCollateral) liabilities[vaultCollateral] = parseAptosInteger(data.total_liability, "total_liability", type);

    const paramsCollateral = extractCollateral(type, "VaultCollateralParams");
    if (paramsCollateral) annualRates[paramsCollateral] = parseAptosInteger(data.interest_annual_rate_ratio?.v, "interest_annual_rate_ratio.v", type);
  });

  const windowSeconds = options.endTimestamp - options.startTimestamp;
  const dailyFeesUsd = Object.entries(liabilities).reduce((sum, [collateral, liability]) => {
    const annualRate = annualRates[collateral];
    if (annualRate === undefined) throw new Error(`Missing annual interest rate for ${collateral}`);

    return sum + liability * annualRate * BigInt(windowSeconds) * USD_SCALE / MOD_DECIMALS / FIXED_POINT_64 / BigInt(YEAR_SECONDS);
  }, 0n);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyFeesNumber = Number(dailyFeesUsd) / Number(USD_SCALE);

  dailyFees.addUSDValue(dailyFeesNumber, BORROW_INTEREST);
  dailyRevenue.addUSDValue(dailyFeesNumber, BORROW_INTEREST);
  dailySupplySideRevenue.addUSDValue(dailyFeesNumber, BORROW_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: "Estimates borrower interest from Move Dollar vault liabilities and annual rates stored on-chain. MOD is treated as USD-pegged.",
  breakdownMethodology: {
    Fees: {
      [BORROW_INTEREST]: "Interest accrued by Move Dollar borrowers during the requested window.",
    },
    Revenue: {
      [BORROW_INTEREST]: "Borrow interest retained by the protocol.",
    },
    SupplySideRevenue: {
      [BORROW_INTEREST]: "Borrow interest distributed to lenders.",
    },
  },
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2023-04-05",
    },
  },
};

export default adapter;
