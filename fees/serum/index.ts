import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { gql, GraphQLClient } from "graphql-request";
import { getEnv } from "../../helpers/env";

/**
 * Serum  Fees Adapter
 * Uses Vybe API to fetch historical volume & calculate fee metrics.
 * Falls back to zero output if no API key or no matching volume.
 */

const endpoint = "https://api.vybenetwork.com/v1/graphql";

const query = gql`
  query QueryVolume {
    api_serum_dex_m {
      globalVolumeStats {
        t
        v
      }
    }
  }
`;

const graphQLClient = new GraphQLClient(endpoint);

const getGQLClient = () => {
  const apiKey = getEnv("PROD_VYBE_API_KEY");
  if (apiKey) {
    graphQLClient.setHeader("authorization", apiKey);
  }
  return graphQLClient;
};

interface IGraphResponse {
  api_serum_dex_m: {
    globalVolumeStats: {
      t: number[];
      v: number[];
    };
  };
}

const fetch = async (timestamp: number) => {
  
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  try {
    const data: IGraphResponse = await getGQLClient().request(query);

    const index = data.api_serum_dex_m.globalVolumeStats.t.findIndex(
      (t) => t === dayTimestamp
    );

    // If no volume found → return structured 0 data 
    if (
      index === -1 ||
      !data.api_serum_dex_m.globalVolumeStats.v[index]
    ) {
      return {
        timestamp: dayTimestamp,
        dailyVolume: "0",
        dailyFees: "0",
        dailyUserFees: "0",
        dailyRevenue: "0",
        dailyProtocolRevenue: "0",
        dailyHoldersRevenue: "0",
        dailySupplySideRevenue: "0",
      };
    }

    const volume = Number(
      data.api_serum_dex_m.globalVolumeStats.v[index]
    );

    // ---------------------------
    // 🚀 Fee Model Calculation
    // ---------------------------
    const takerFees = volume * 0.0004 * 0.5; // 4 bps on 50% taker volume
    const makerRebates = volume * 0.0002 * 0.5; // 2 bps back to makers
    const netFees = takerFees - makerRebates; // Net fees collected
    const revenue = netFees * 0.2; // Estimated UI revenue share (20%)

    return {
      timestamp: dayTimestamp,
      dailyVolume: volume.toString(),
      dailyUserFees: takerFees.toString(),
      dailyFees: netFees.toString(),
      dailySupplySideRevenue: makerRebates.toString(),
      dailyRevenue: revenue.toString(),
      dailyProtocolRevenue: "0", // No treasury
      dailyHoldersRevenue: "0", // No token
    };
  } catch (error: any) {
    // 403 -> No API key or denied
    if (error?.response?.status === 403) {
      console.log(
        "⚠ Vybe API: Missing PROD_VYBE_API_KEY - returning zero data."
      );
    } else {
      console.error("Error fetching Serum fees data:", error);
    }

    return {
      timestamp: dayTimestamp,
      dailyVolume: "0",
      dailyFees: "0",
      dailyUserFees: "0",
      dailyRevenue: "0",
      dailyProtocolRevenue: "0",
      dailyHoldersRevenue: "0",
      dailySupplySideRevenue: "0",
    };
  }
};

const getStartTimestamp = async () => {
  try {
    const data: IGraphResponse = await getGQLClient().request(query);
    return data.api_serum_dex_m.globalVolumeStats.t[0];
  } catch {
    // Fallback start date = Serum launch (Aug 20, 2021)
    return 1629417600;
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: "2023-09-12", // Serum died post-FTX
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: getStartTimestamp,
      meta: {
        methodology: {
          UserFees:
            "4 bps taker fee (assuming 50% of volume is taker side)",
          Fees:
            "Net fees = taker fees (4 bps) - maker rebates (2 bps)",
          Revenue:
            "20% of net fees estimated to UI providers. No treasury.",
          SupplySideRevenue:
            "Maker rebates (2 bps) go to LPs / market makers",
          ProtocolRevenue:
            "0 - OpenBook/Serum has no protocol token or treasury",
          HoldersRevenue:
            "0 - No distribution to token holders post-FTX",
        },
      },
    },
  },
};

export default adapter;
