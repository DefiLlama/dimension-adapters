import { request } from "graphql-request";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ADA_ID = "ada.lovelace";
const endpoint = "https://api.sundae.fi/graphql";

const formatDate = (ts: number) => {
  return new Date(ts * 1000).toISOString().replace('T', ' ').substring(0, 19);
};

const formatAsset = (assetId: string) => {
  const [policy, name] = assetId.split(".");
  return name ? policy + name : assetId;
};

const addFee = (
  balanceObj: any,
  assetId: string,
  quantity: string,
) => {
  if (!assetId) return;

  if (assetId === ADA_ID) {
    const amount = Number(quantity) / 1e6;
    balanceObj.addCGToken("cardano", amount);
  } else {
    balanceObj.addToken(formatAsset(assetId), Number(quantity));
  }
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const start = formatDate(options.startTimestamp);
  const end = formatDate(options.endTimestamp);

  const query = `
    query fetchPools($start: String!, $end: String!) {
      pools {
        popular {
          ticks(start: $start, end: $end, interval: All) {
            rich {
              protocolFees { quantity asset { id } }
              lpFees(unit: Natural) { quantity asset { id } }
            }
          }
        }
      }
    }
  `;

  const data = await request(endpoint, query, { start, end });
  const pools = data?.pools?.popular ?? [];

  for (const pool of pools) {
    const richEntries = pool?.ticks?.rich ?? [];

    for (const entry of richEntries) {
      const { lpFees, protocolFees } = entry;

      if (lpFees?.asset?.id) {
        addFee(dailySupplySideRevenue, lpFees.asset.id, lpFees.quantity);
      }

      if (protocolFees?.asset?.id) {
        addFee(dailyRevenue, protocolFees.asset.id, protocolFees.quantity);
      }
    }
  }

  dailyFees.addBalances(dailySupplySideRevenue, METRIC.LP_FEES);
  dailyFees.addBalances(dailyRevenue, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const methodology = {
  Fees: "The total trading fees paid by users, excluding L1 transaction fees",
  Revenue: "A fixed ADA cost per transaction that is collected by the protocol",
  SupplySideRevenue: "A percentage cut on all trading volume, paid to Liquidity Providers",
  ProtocolRevenue: "A fixed ADA cost per transaction that is collected by the protocol",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "A percentage cut on all trading volume, paid to Liquidity Providers",
    [METRIC.PROTOCOL_FEES]: "A fixed ADA cost per transaction that is collected by the protocol"
  }
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.CARDANO],
  fetch,
  start: "2022-01-20",
  methodology,
  breakdownMethodology,
};

export default adapter;
