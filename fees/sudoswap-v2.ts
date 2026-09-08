import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived } from "../helpers/token";
import { queryAllium } from "../helpers/allium";

const PROTOCOL_FEE_LABEL = "Protocol fees";
const ROYALTY_FEE_LABEL = "Creator royalties";

const FACTORY = '0xa020d57ab0448ef74115c112d18a9c231cc86000';
// NewPair(address poolAddress) emitted by the factory on pool creation
const NEW_PAIR_TOPIC = '0xe8e1cee58c33f242c87d563bbc00f2ac82eb90f10a252b0ba8498ae6c1dc241a';

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const protocolFees = await getETHReceived({ options, target: FACTORY });

  // Creator royalties: within a sale transaction a pool pays out multiple ETH
  // transfers (seller proceeds + royalty); the smallest one is the royalty.
  // Same heuristic as the old indexa query, on Allium tables.
  const [royalties] = await queryAllium(`
    WITH pools AS (
      SELECT DISTINCT '0x' || SUBSTR(topic1, 27) AS pool
      FROM ethereum.raw.logs
      WHERE address = '${FACTORY}'
        AND topic0 = '${NEW_PAIR_TOPIC}'
    ),
    min_values AS (
      SELECT t.transaction_hash, t.from_address, MIN(t.raw_amount) AS min_value
      FROM ethereum.assets.native_token_transfers t
      JOIN pools p ON t.from_address = p.pool
      WHERE t.transfer_type = 'value_transfer'
        AND t.to_address != '${FACTORY}'
        AND t.raw_amount > 0
        AND t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      GROUP BY t.transaction_hash, t.from_address
      HAVING COUNT(*) > 1
    )
    SELECT SUM(min_value) AS royalties_fees FROM min_values
  `);

  dailyFees.addBalances(protocolFees, PROTOCOL_FEE_LABEL)
  dailyFees.addGasToken(royalties.royalties_fees ?? 0, ROYALTY_FEE_LABEL)
  dailyRevenue.addBalances(protocolFees, PROTOCOL_FEE_LABEL)
  return { dailyFees, dailyRevenue, }
}

const methodology = {
  Fees: "Protocol fees and creator royalties collected on NFT trades",
  Revenue: "Protocol fees retained by sudoswap, excluding creator royalties paid to NFT creators"
}

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees charged on NFT trades through sudoswap v2 AMM pools",
    [ROYALTY_FEE_LABEL]: "Creator royalties paid to NFT collection creators on secondary sales"
  },
  Revenue: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees retained by sudoswap from NFT trades"
  }
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-05-21',
  methodology,
  breakdownMethodology
};

export default adapter;
