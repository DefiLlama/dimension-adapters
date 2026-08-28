import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const REENTAL_GRAPHQL_URL = "https://backend.reental.co/graphql";
const PROPERTY_OFFERING_FEES = "Property Offering Fees";
const PAGE_SIZE = 200;

type Currency = "EUR" | "USD";

type ReentalProperty = {
  tokenName: string;
  starts_on: string;
  amount?: {
    value?: number;
    currency?: Currency;
  };
  token?: {
    address?: string;
    totalSupply?: string;
    maxSupply?: string;
    sold?: string;
  };
};

type FeeConfig = {
  rate: number;
  source: string;
};

const feeConfigs: Record<string, FeeConfig> = {
  "Reental-RET-2": {
    rate: 0.08,
    source: "https://d23t4e7dm0xzj0.cloudfront.net/RET-2/docs-en/1769587654102_whitepaper_ret_2_eng.pdf",
  },
  "Reental-SLA-3": {
    rate: 0.068,
    source: "https://d23t4e7dm0xzj0.cloudfront.net/SLA-3/docs-en/1770118045987_sla_3_whitepaper_eng.pdf",
  },
  "Reental-GRX-4": {
    rate: 0.1,
    source: "https://d23t4e7dm0xzj0.cloudfront.net/GRX-4/docs-en/1772118732864_whitepaper_grx_4_eng.pdf",
  },
  "Reental-LVT-2": {
    rate: 0.068,
    source: "https://d23t4e7dm0xzj0.cloudfront.net/LVT-2/docs-en/1772782930104_lvt_2_whitepaper_eng.pdf",
  },
  "Reental-SLA-4": {
    rate: 0.05,
    source: "https://d23t4e7dm0xzj0.cloudfront.net/SLA-4/docs-en/1774862676665_white_paper_salta_4_eng.pdf",
  },
  "Reental-MAD-5": {
    rate: 0.06,
    source: "https://d23t4e7dm0xzj0.cloudfront.net/MAD-5/docs-en/1776944819770_white_paper_mad_5_eng.pdf",
  },
  "Reental-MAD-6": {
    rate: 0.09,
    source: "https://d23t4e7dm0xzj0.cloudfront.net/MAD-6/docs-en/1778227371828_mad_6_whitepaper_eng.pdf",
  },
};

const GET_PUBLIC_PROPERTIES_QUERY = `
  query GetPublicProperties($input: GetPropertiesInput!) {
    getPublicProperties(input: $input) {
      ... on PropertyAssets {
        items {
          tokenName
          starts_on
          amount {
            value
            currency
          }
          token {
            address
            totalSupply
            maxSupply
            sold
          }
        }
      }
    }
  }
`;

async function getPublicProperties(): Promise<ReentalProperty[]> {
  const properties: ReentalProperty[] = [];
  let offset = 0;

  while (true) {
    const response = await httpPost(
      REENTAL_GRAPHQL_URL,
      {
        query: GET_PUBLIC_PROPERTIES_QUERY,
        variables: {
          input: {
            limit: PAGE_SIZE,
            offset,
            hidePrivate: true,
            orderBy: "createdAt",
            orderDirection: "DESC",
          },
        },
      },
      { headers: { "content-type": "application/json" } }
    );

    if (response.errors?.length) {
      throw new Error(`Reental GraphQL returned errors: ${response.errors.map((error: any) => error.message).join("; ")}`);
    }

    const items = response.data?.getPublicProperties?.items;
    if (!Array.isArray(items)) throw new Error("Reental GraphQL response did not include public property items");

    properties.push(...items);
    if (items.length < PAGE_SIZE) return properties;
    offset += PAGE_SIZE;
  }
}

function isInWindow(isoDate: string, options: FetchOptions) {
  const timestamp = Math.floor(new Date(isoDate).getTime() / 1000);
  return timestamp >= options.startTimestamp && timestamp < options.endTimestamp;
}

function hasStarted(isoDate: string, options: FetchOptions) {
  const timestamp = Math.floor(new Date(isoDate).getTime() / 1000);
  return timestamp < options.endTimestamp;
}

function addFeeAmount(balance: any, amount: number, currency: Currency) {
  if (currency === "USD") {
    balance.addCGToken("usd-coin", amount, PROPERTY_OFFERING_FEES);
    return;
  }

  if (currency === "EUR") {
    balance.addCGToken("euro-coin", amount, PROPERTY_OFFERING_FEES);
    return;
  }

  throw new Error(`Unsupported Reental fee currency: ${currency}`);
}

async function validateConfiguredTokenSupply(properties: ReentalProperty[], options: FetchOptions) {
  const configuredProperties = properties.filter((property) => feeConfigs[property.tokenName] && property.token?.address && hasStarted(property.starts_on, options));
  const totalSupplies = await options.toApi.multiCall({
    calls: configuredProperties.map((property) => property.token!.address!),
    abi: "erc20:totalSupply",
    permitFailure: true,
  });

  configuredProperties.forEach((property, index) => {
    const expectedSupply = property.token?.totalSupply;
    const onchainSupply = totalSupplies[index]?.toString();

    if (!expectedSupply || !onchainSupply) {
      console.warn(`Reental: supply validation failed for ${property.tokenName} (${property.token?.address}): API ${expectedSupply}, onchain ${onchainSupply}`);
      throw new Error(`Reental token supply missing for ${property.tokenName}: API ${expectedSupply}, onchain ${onchainSupply}`);
    }
    if (expectedSupply !== onchainSupply) {
      throw new Error(`Reental token supply mismatch for ${property.tokenName}: API ${expectedSupply}, onchain ${onchainSupply}`);
    }
  });
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const properties = await getPublicProperties();
  await validateConfiguredTokenSupply(properties, options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const property of properties) {
    const config = feeConfigs[property.tokenName];
    if (!config || !property.amount?.value || !property.amount.currency || !isInWindow(property.starts_on, options)) continue;

    const feeAmount = property.amount.value * config.rate;
    addFeeAmount(dailyFees, feeAmount, property.amount.currency);
    addFeeAmount(dailyRevenue, feeAmount, property.amount.currency);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Upfront subscription or offering fees from Reental public property offerings, calculated from Reental's official public GraphQL property amounts and manually verified fee rates in each official property whitepaper.",
  Revenue: "The upfront subscription or offering fee retained by Reental or the issuer/manager for structuring, coordination, operational oversight, and investor onboarding services.",
  ProtocolRevenue: "Same as revenue. These fees are retained by Reental or the issuer/manager and are not distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [PROPERTY_OFFERING_FEES]: "One-time subscription or offering fees. Each configured property uses its official whitepaper fee rate and Reental's public GraphQL property amount.",
  },
  Revenue: {
    [PROPERTY_OFFERING_FEES]: "One-time subscription or offering fees retained by Reental or the issuer/manager.",
  },
  ProtocolRevenue: {
    [PROPERTY_OFFERING_FEES]: "One-time subscription or offering fees retained by Reental or the issuer/manager.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: "2026-01-28",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
