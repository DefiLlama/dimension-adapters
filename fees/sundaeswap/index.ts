import { request } from "graphql-request";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ADA_ID = "ada.lovelace";
const endpoint = "https://api.sundae.fi/graphql";

const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
    ).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(
        d.getUTCMinutes()
    ).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
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
    const dailyProtocolRevenue = options.createBalances();

    const start = formatDate(options.startTimestamp);
    const end = formatDate(options.endTimestamp);

    const query = `
    query fetchPools($start: String!, $end: String!) {
      pools {
        popular {
          ticks(start: $start, end: $end, interval: All) {
            rich {
              txFees { quantity asset { id } }
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
            const { txFees, lpFees, protocolFees } = entry;

            if (txFees?.asset?.id)
                addFee(dailyFees, txFees.asset.id, txFees.quantity);

            if (lpFees?.asset?.id)
                addFee(dailyFees, lpFees.asset.id, lpFees.quantity);

            if (protocolFees?.asset?.id) {
                addFee(dailyRevenue, protocolFees.asset.id, protocolFees.quantity);
                addFee(dailyProtocolRevenue, protocolFees.asset.id, protocolFees.quantity);
            }
        }
    }

    return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.CARDANO]: {
            fetch,
            start: "2025-05-16",
        },
    },
    allowNegativeValue: false,
    methodology: {
        Fees: "Total trading fees paid by users (LP + protocol)",
        Revenue: "Protocol share of trading fees",
        ProtocolRevenue: "Protocol share of trading fees",
    },
};

export default adapter;
