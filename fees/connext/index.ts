import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

type Transfer = {
  bridgedAmt: number;
  transactingAsset: string;
  relayerFees: {
    asset: string;
    fee: number;
  }[];
};
const getDailyFee = () =>
  gql`
    query originTransfers($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
      originTransfers(
        where: { timestamp_gt: $startTimestamp, timestamp_lt: $endTimestamp }
      ) {
        bridgedAmt
        transactingAsset
        relayerFees {
          fee
          asset
        }
      }
    }
  `;
const getGQLClient = (url: string) => new GraphQLClient(url);

const subgraphs = {
  [CHAIN.ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-mainnet",
  [CHAIN.OPTIMISM]:
    "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-optimism",
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-arbitrum-one",
  [CHAIN.POLYGON]:
    "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-polygon",
  [CHAIN.BSC]:
    "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-bnb",
  [CHAIN.XDAI]:
    "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-gnosis",
  //   [CHAIN.LINEA]:
  //     "https://connext.bwarelabs.com/subgraphs/name/connext/amarok-runtime-v0-linea",
};

const fetch: FetchV2 = async ({
  createBalances,
  chain,
  startTimestamp,
  endTimestamp,
}) => {
  const dailyFees = createBalances();
  const dailyVolume = createBalances();
  const transfers: Transfer[] = (
    await getGQLClient(subgraphs[chain]).request(getDailyFee(), {
      startTimestamp,
      endTimestamp,
    })
  ).originTransfers;

  transfers.map((t: Transfer) => {
    dailyVolume.add(t.transactingAsset, t.bridgedAmt);
    t.relayerFees.map(({ asset, fee }) => {
      dailyFees.add(asset, fee);
    });
  });
  return { dailyFees, dailyVolume };
};
// ts-node --transpile-only cli/testAdapter.ts fees connext
const adapter: SimpleAdapter = {
  adapter: Object.keys(subgraphs).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: 1698660910,
      },
    };
  }, {}),
  version: 2,
};

export default adapter;
