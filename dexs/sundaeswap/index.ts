import { request, gql } from "graphql-request";
import {
  FetchOptions,
  FetchResult,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint = "https://api.sundae.fi/graphql";

interface VolumeStat {
  asset: {
    id: string;
  };
  quantity: string;
}

interface GraphQLResponse {
  stats: {
    volume: VolumeStat;
  };
}

const query = gql`
  query StatsVolume {
    stats {
      volume {
        asset {
          id
        }
        quantity
      }
    }
  }
`;

const fetch = async (
  options: FetchOptions,
): Promise<FetchResult> => {
  const dailyVolume =
    options.createBalances();

  const response =
    await request<GraphQLResponse>(
      endpoint,
      query,
    );

  const volume =
    response.stats.volume;

  if (!volume) {
    return { dailyVolume };
  }

  const assetId =
    volume.asset.id;

  const quantity =
    Number(volume.quantity);

  if (
    assetId === "ada.lovelace" ||
    assetId === "lovelace"
  ) {
    dailyVolume.addGasToken(
      quantity,
    );
  } else {
    dailyVolume.add(
      assetId,
      quantity,
    );
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch,
  //start: "2022-02-01",
  runAtCurrTime: true,
};

export default adapter;
