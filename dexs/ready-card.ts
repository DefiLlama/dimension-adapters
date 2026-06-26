import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const chainConfig = {
  [CHAIN.STARKNET]: {
    start: '2024-11-10',
  },
};

const fetch = async (options: FetchOptions) => {
  const results = await queryDuneSql(options, `
    with transfers as (
      select
        varbinary_to_uint256(e.data[3]) / 1e6 as amount -- "value"
      from starknet.events e
      where TIME_RANGE
        and e.block_date >= DATE '2024-11-01'
        and e.from_address = 0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8 -- USDC (old)
        and e.keys[1] = 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9 -- Transfer
        and e.data[2] in ( -- "to": Kulipa Settlement Account
          0x01ed562f56c422befa5b4d15016e78b2aec8f86b5fcb2457b33d8c3481190f2a,
          0x01b573d6ece97aea59d36cb453d22d89e77d30787bc5a82efdbeae3f8015e0c1 -- 2026-03-12
        )
        and exists (
          select 1
          from starknet.transactions t
          where t.transaction_hash = e.transaction_hash
            and t.block_date >= date(from_unixtime(${options.startTimestamp}))
            and t.block_date <= date(from_unixtime(${options.endTimestamp}))
            and t.block_time >= from_unixtime(${options.startTimestamp})
            and t.block_time <= from_unixtime(${options.endTimestamp})
            and contains(t.calldata, 0x0000000000000000000000000000000000000073657373696f6e2d746f6b656e) -- SESSION_MAGIC
        )

      union all

      select
        varbinary_to_uint256(e.data[1]) / 1e6 as amount -- "value"
      from starknet.events e
      where TIME_RANGE
        and e.block_date >= DATE '2025-10-01' -- USDC migration
        and e.from_address = 0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb -- USDC (new)
        and e.keys[1] = 0x0099cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9 -- Transfer
        and e.keys[3] in ( -- "to": Kulipa Settlement Account
          0x01ed562f56c422befa5b4d15016e78b2aec8f86b5fcb2457b33d8c3481190f2a,
          0x01b573d6ece97aea59d36cb453d22d89e77d30787bc5a82efdbeae3f8015e0c1 -- 2026-03-12
        )
        and exists (
          select 1
          from starknet.transactions t
          where t.transaction_hash = e.transaction_hash
            and t.block_date >= date(from_unixtime(${options.startTimestamp}))
            and t.block_date <= date(from_unixtime(${options.endTimestamp}))
            and t.block_time >= from_unixtime(${options.startTimestamp})
            and t.block_time <= from_unixtime(${options.endTimestamp})
            and contains(t.calldata, 0x0000000000000000000000000000000000000073657373696f6e2d746f6b656e) -- SESSION_MAGIC
        )
    )
    select coalesce(sum(amount), 0) as total_volume from transfers
  `)
  
  return { dailyVolume: (results[0] && results[0].total_volume) ? results[0].total_volume : 0 };
};

const methodology = {
  Volume: "Total USDC card spend settled to Ready/Kulipa settlement accounts on Starknet.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  adapter: chainConfig,
  methodology,
};

export default adapter;
