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

const ethereum_endpointId: string =
  "3GhHcRwF6yH7WXGcJJvac9B5MHPuoXhS9uxc49TPqLf6";
const avax_endpointId: string = "AmJzFkqot9NjxPCRLK8yXopYt3rtS736ZEX2zEFg7Tz2";

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
  endpointId: string,
  { getStartBlock, getEndBlock, createBalances }: FetchOptions
): Promise<FetchResultV2> => {
  const dailyFees = createBalances();
  const totalFees = createBalances();
  const dailyVolume = createBalances();
  const totalVolume = createBalances();

  const [prevDayBlock, toDayBlock] = await Promise.all([
    getStartBlock(),
    getEndBlock(),
  ]);

  const endpoint = sdk.graph.modifyEndpoint(endpointId);

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
      totalFees.add(token, currFee);
      const dailyFee = currFee - prevFee;
      if (dailyFee >= 0) {
        dailyFees.add(token, dailyFee);
      }

      totalVolume.add(token, currVolume);
      const dailyVolumee = currVolume - prevVolume;
      if (dailyVolumee >= 0) {
        dailyVolume.add(token, dailyVolumee);
      }
    }
  });

  return { dailyFees, dailyVolume, totalFees, totalVolume };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) => fetch(ethereum_endpointId, options),
      start: 1617228000,
    },
    [CHAIN.AVAX]: {
      fetch: (options: FetchOptions) => fetch(avax_endpointId, options),
      start: 1617228000,
      runAtCurrTime: false,
    },
  },
};

export default adapter;
