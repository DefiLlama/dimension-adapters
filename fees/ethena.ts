import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const mint_event = 'event Mint( address indexed minter,address indexed benefactor,address indexed beneficiary,address collateral_asset,uint256 collateral_amount,uint256 usde_amount)';
const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    eventAbi: mint_event,
    target: '0x2cc440b721d2cafd6d64908d6d8c4acc57f8afc3',
  });
  const in_flow = await queryIndexer(`
  SELECT
    '0x' || encode(data, 'hex') AS data,
    '0x' || encode(contract_address, 'hex') AS token
  FROM
    ethereum.event_logs
  WHERE
    block_number > 18637861
    AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    AND topic_2 in ('\\x00000000000000000000000071e4f98e8f20c88112489de3dded4489802a3a87')
    AND block_time BETWEEN llama_replace_date_range;
`, options);

const out_flow = await queryIndexer(`
  SELECT
    '0x' || encode(data, 'hex') AS data,
    '0x' || encode(contract_address, 'hex') AS token
  FROM
    ethereum.event_logs
  WHERE
    block_number > 18637861
    AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    AND topic_2 in ('\\x000000000000000000000000f2fa332bd83149c66b09b45670bce64746c6b439')
    AND block_time BETWEEN llama_replace_date_range;
`, options);
  const dailyFeesInflow = options.createBalances();
  const supplyRewards = options.createBalances();

  in_flow.map((log: any) => {
    const amount = Number(log.data);
    dailyFeesInflow.add(log.token, amount);
  });
  out_flow.map((log: any) => {
    const amount = Number(log.data);
    supplyRewards.add(log.token, amount);
  });
  const dailyFeesMint = options.createBalances();
  logs.map((log) => {
    dailyFeesMint.add(log.collateral_asset, log.collateral_amount);
  });

  dailyFeesMint.resizeBy(0.001)
  dailyFeesMint.addBalances(dailyFeesInflow);
  const revenue = dailyFeesMint.clone()
  revenue.subtract(supplyRewards)
  return {
    dailyFees: dailyFeesMint,
    dailyRevenue: revenue,
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1700784000
    }
  }
}
export default adapters
