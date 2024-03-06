import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const fetch = (): any => {
  return async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = options.createBalances();

    const logs = await queryIndexer(`
      SELECT
        block_time,
        encode(transaction_hash, 'hex') AS HASH,
        encode(data, 'hex') AS data
      FROM
        ethereum.event_logs
      WHERE
        contract_address = '\\xac3e018457b222d93114458476f3e3416abbe38f'
        and block_number > 15686281
        AND topic_0 = '\\x2fa39aac60d1c94cda4ab0e86ae9c0ffab5b926e5b827a4ccba1d9b5b2ef596e'
        AND block_time BETWEEN llama_replace_date_range  `, options);

      // event NewRewardsCycle (index_topic_1 uint32 cycleEnd, uint256 rewardAmount)

      logs.map((p: any) => dailyFees.addGasToken('0x'+p.data))
      dailyFees.resizeBy(1/0.9)


      const dailySupplySideRevenue = dailyFees.clone();
      dailySupplySideRevenue.resizeBy(0.9);
      const dailyRevenue = dailyFees.clone();
      dailyRevenue.resizeBy(0.1);


    return {
      timestamp,
      dailyFees,
      dailySupplySideRevenue: dailySupplySideRevenue,
      dailyRevenue: dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailyHoldersRevenue: '0',
      dailyUserFees: '0',
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(),
        start: 1665014400,
    },
  }
}

export default adapter;
