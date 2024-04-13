import { ETHER_ADDRESS } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryIndexer } from "../../helpers/indexer";

const fetchVolume = async (options: FetchOptions) => {
  const volumeResult: any = await queryIndexer(
    `
    SELECT sum(Value) as "value" FROM (
      SELECT b.Value as Value FROM blast.core.fact_event_logs a 
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE a.contract_address = LOWER('\\x0000000000E14E87e5c80A8A90817308fFF715d3')
      AND a.tx_status = 'SUCCESS'
      AND a.topics[0] = '\\x73a19dd210f1a7f902193214c0ee91dd35ee5b4d920cba8d519eca65a7b488ca' -- yolo deposited
      UNION ALL
      SELECT b.Value as Value FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\x0000000000E14E87e5c80A8A90817308fFF715d3')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xa315167fc4200676e8597c5df065fafa8cecfeac15a8e2aded299a649e4a5175' -- yolo multientry
      UNION ALL
      SELECT b.Value as Value FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\xA56A95F41e64Bc76CDE7423aB2A2ee1763bD8Bcc')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xe0498ef6c8973f40195b2ced16991e2e7cba0d33e6a5e42a2e7797d156c874a3' -- btc moon
      UNION ALL
      SELECT b.Value as Value FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\x693B37a9859Ce9465Fb2aAdeB03811a26A0c37C0')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xe0498ef6c8973f40195b2ced16991e2e7cba0d33e6a5e42a2e7797d156c874a3' -- eth moon
      UNION ALL
      SELECT b.Value as Value FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\xA56A95F41e64Bc76CDE7423aB2A2ee1763bD8Bcc')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xd63b8da4d354e3b7b933761d564d3f17070134d43c981eb109c7c35f87932d29' -- btc doom
      UNION ALL
      SELECT b.Value as Value FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\x693B37a9859Ce9465Fb2aAdeB03811a26A0c37C0')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xd63b8da4d354e3b7b933761d564d3f17070134d43c981eb109c7c35f87932d29' -- eth doom
      UNION ALL
      SELECT b.Value as Value FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\x0000000000acc01064aa5280da3f1c41a35827bc')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\x9a711314e8e01b50116aefb9d50edc1a6b06e39986010af70d18671666586d0e' -- ptb rounds entered
    )
    WHERE block_time BETWEEN llama_replace_date_range;`,
    options
  );
  return volumeResult[0].value;
};

const fetchFees = async (options: FetchOptions) => {
  const volumeResult: any = await queryIndexer(
    `
    SELECT sum(Value) as "value" FROM (
      SELECT b.Value*0.01 as Fee FROM blast.core.fact_event_logs a 
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE a.contract_address = LOWER('\\x0000000000E14E87e5c80A8A90817308fFF715d3')
      AND a.tx_status = 'SUCCESS'
      AND a.topics[0] = '\\x73a19dd210f1a7f902193214c0ee91dd35ee5b4d920cba8d519eca65a7b488ca' -- yolo deposited
      UNION ALL
      SELECT b.Value*0.01 as Fee FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\x0000000000E14E87e5c80A8A90817308fFF715d3')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xa315167fc4200676e8597c5df065fafa8cecfeac15a8e2aded299a649e4a5175' -- yolo multientry
      UNION ALL
      SELECT b.Value*0.01 as Fee FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\xA56A95F41e64Bc76CDE7423aB2A2ee1763bD8Bcc')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xe0498ef6c8973f40195b2ced16991e2e7cba0d33e6a5e42a2e7797d156c874a3' -- btc moon
      UNION ALL
      SELECT b.Value*0.01 as Fee FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\x693B37a9859Ce9465Fb2aAdeB03811a26A0c37C0')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xe0498ef6c8973f40195b2ced16991e2e7cba0d33e6a5e42a2e7797d156c874a3' -- eth moon
      UNION ALL
      SELECT b.Value*0.01 as Fee FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\xA56A95F41e64Bc76CDE7423aB2A2ee1763bD8Bcc')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xd63b8da4d354e3b7b933761d564d3f17070134d43c981eb109c7c35f87932d29' -- btc doom
      UNION ALL
      SELECT b.Value*0.01 as Fee FROM blast.core.fact_event_logs a
      INNER JOIN blast.core.fact_transactions b ON a.TX_HASH = b.TX_HASH
      WHERE contract_address = LOWER('\\x693B37a9859Ce9465Fb2aAdeB03811a26A0c37C0')
      AND tx_status = 'SUCCESS'
      AND topics[0] = '\\xd63b8da4d354e3b7b933761d564d3f17070134d43c981eb109c7c35f87932d29' -- eth doom
      UNION ALL
      SELECT DATE_TRUNC('day', block_timestamp) as day, value as Fee FROM blast.core.fact_traces
      WHERE TO_ADDRESS = LOWER('\\x6b86fF7863e27d1C8CCf05dF9cB03b8eFaA52125')
      AND FROM_ADDRESS = LOWER('\\x0000000000acc01064aa5280da3f1c41a35827bc') -- PTB 
    )
    WHERE block_time BETWEEN llama_replace_date_range;`,
    options
  );
  return volumeResult[0].value;
};

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const [volume, fees] = await Promise.all([
    fetchVolume(options),
    fetchFees(options),
  ]);
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  dailyFees.add(ETHER_ADDRESS, fees);
  dailyVolume.add(ETHER_ADDRESS, volume);
  return {
    dailyFees,
    dailyVolume,
    timestamp,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      start: 1709233200, // 29th February 2024
    },
  },
};

export default adapter;
