import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IVault {
  id: string;
  totalFeeCollected: number;
  totalNominalVolume: number;
  underlyingAsset: string;
}

interface IVaultsResponse {
  vaults: IVault[];
}

const config = {
  [CHAIN.ETHEREUM]: {
    endpointId: "3GhHcRwF6yH7WXGcJJvac9B5MHPuoXhS9uxc49TPqLf6",
    start: '2021-04-01',
  },
  [CHAIN.AVAX]: {
    endpointId: "AmJzFkqot9NjxPCRLK8yXopYt3rtS736ZEX2zEFg7Tz2",
    start: '2021-04-01',
  }
}

const query = gql`
  query getVaults($block: Int!) {
    vaults(block: { number: $block }) {
      id
      totalFeeCollected
      totalNominalVolume
      underlyingAsset
    }
  }
`;

const fetch = async (
  { getStartBlock, getEndBlock, createBalances, chain }: FetchOptions
): Promise<FetchResultV2> => {
  const dailyFees = createBalances();
  const dailyVolume = createBalances();

  const [prevDayBlock, toDayBlock] = await Promise.all([
    getStartBlock(),
    getEndBlock(),
  ]);

  const endpoint = sdk.graph.modifyEndpoint(config[chain].endpointId);

  const [{ vaults: fromVaults }, { vaults: toVaults }] = await Promise.all([
    request<IVaultsResponse>(endpoint, query, { block: prevDayBlock - 50 }),
    request<IVaultsResponse>(endpoint, query, { block: toDayBlock - 50 }),
  ]);

  toVaults.forEach((toVault) => {
    const fromVault = fromVaults.find((vault) => vault.id === toVault.id);

    const token = toVault.underlyingAsset;
    const prevFee = fromVault ? fromVault.totalFeeCollected : 0;
    const currFee = toVault.totalFeeCollected;

    const prevVolume = fromVault ? fromVault.totalNominalVolume : 0;
    const currVolume = toVault.totalNominalVolume;

    if (token) {
      const dailyFee = currFee - prevFee;
      if (dailyFee >= 0) {
        dailyFees.add(token, dailyFee);
      }

      const dailyVolumee = currVolume - prevVolume;
      if (dailyVolumee >= 0) {
        dailyVolume.add(token, dailyVolumee);
      }
    }
  });

  return { dailyFees, dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-04-01',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2021-04-01',
    },
  },
  methodology: {
    Fees: "Trading fees paid by users.",
  },
};

export default adapter;
