import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const results = await queryDuneSql(options, `
    select sum(amount) as total_volume from (
      select
        events.block_time,
        events.data[1] as account_address, -- "from"
        varbinary_to_uint256(events.data[3])/1e6 as amount, -- "value"
        transaction_hash
      from starknet.events
        join starknet.transactions using (transaction_hash)
      where events.from_address = 0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8 -- USDC (old) contract
        and events.keys[1] = 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9 -- Transfer
        and events.data[2] = 0x01ed562f56c422befa5b4d15016e78b2aec8f86b5fcb2457b33d8c3481190f2a -- "to": Kulipa Settlement Account
        and contains(transactions.calldata, 0x0000000000000000000000000000000000000073657373696f6e2d746f6b656e) -- SESSION_MAGIC see https://github.com/argentlabs/argent-contracts-starknet/blob/1352198956f36fb35fa544c4e46a3507a3ec20e3/src/session/session.cairo#L26
        and events.block_time >= from_unixtime(${options.startTimestamp})
        and events.block_time <= from_unixtime(${options.endTimestamp})

      union all

      select
        events.block_time,
        events.keys[2] as account_address, -- "from"
        varbinary_to_uint256(events.data[1])/1e6 as amount, -- "value"
        transaction_hash
      from starknet.events
        join starknet.transactions using (transaction_hash)
      where events.from_address = 0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb  -- USDC (new) contract
        and events.keys[1] = 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9 -- Transfer
        and events.keys[3] = 0x01ed562f56c422befa5b4d15016e78b2aec8f86b5fcb2457b33d8c3481190f2a -- "to": Kulipa Settlement Account
        and contains(transactions.calldata, 0x0000000000000000000000000000000000000073657373696f6e2d746f6b656e) -- SESSION_MAGIC see https://github.com/argentlabs/argent-contracts-starknet/blob/1352198956f36fb35fa544c4e46a3507a3ec20e3/src/session/session.cairo#L26
        and events.block_time >= from_unixtime(${options.startTimestamp})
        and events.block_time <= from_unixtime(${options.endTimestamp})
    )
  `)
  
  if (!results[0]) {
    throw Error(`Failed to query dune data for ready-card, please check the query and fix it`);
  }

  return { dailyVolume: results[0].total_volume };
};

const adapter: SimpleAdapter = {
  fetch,
  start: '2024-11-10',
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.STARKNET],
};

export default adapter;