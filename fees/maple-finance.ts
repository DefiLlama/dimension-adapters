import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryIndexer } from "../helpers/indexer";

const eth_base = '0x373bdcf21f6a939713d5de94096ffdb24a406391';

const contract_loan_mangaer: string[] = [
  '0x91582bdfef0bf36fc326a4ab9b59aacd61c105ff',
  '0xeca9d2c5f81dd50dce7493104467dc33362a436f',
  '0xf4d4a5270aa834a2a77011526447fdf1e227018f',
  '0x1b61765e954113e6508c4f9db07675989f7f5874',
  '0xd05998a1940294e3e49f99dbb13fe20a3483f5ae',
  '0xd7217f29d51deffc6d5f95ff0a5200f3d34c0f66',
  '0x6b6491aaa92ce7e901330d8f91ec99c2a157ebd7',
  '0x74cb3c1938a15e532cc1b465e3b641c2c7e40c2b',
  '0x9b300a28d7dc7d422c7d1b9442db0b51a6346e00',
  '0x373bdcf21f6a939713d5de94096ffdb24a406391',
  '0xfdc7541201aa6831a64f96582111ced633fa5078'
]

const contract_open_term_loan: string[] = [
  '0x2638802a78d6a97d0041cc7b52fb9a80994424cd',
  '0x483082e93635ef280bc5e9f65575a7ff288aba33',
  '0x93b0f6f03cc6996120c19abff3e585fdb8d88648',
  '0xd205b3ed8408afca53315798b891f37bd4c5ce2a',
  '0xdc9b93a8a336fe5dc9db97616ea2118000d70fc0',
  '0xfab269cb4ab4d33a61e1648114f6147742f5eecc'
]

const fetchFees = async (timestamp: number, _: any, options: FetchOptions) => {
  const { getLogs } = options
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logsTranferERC20: any[] = await queryIndexer(`
        SELECT
          '0x' || encode(data, 'hex') AS value,
          '0x' || encode(contract_address, 'hex') AS contract_address
        FROM
          ethereum.event_logs
        WHERE
          block_number > 12428594
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 in ('\\x000000000000000000000000a9466eabd096449d650d5aeb0dd3da6f52fd0b19', '\\x000000000000000000000000d15b90ff80aa7e13fc69cd7ccd9fef654495e36c')
          AND block_time BETWEEN llama_replace_date_range;
          `, options);
  const logs_funds_distribution = await getLogs({
    targets: contract_loan_mangaer,
    flatten: false,
    eventAbi: 'event FundsDistributed(address indexed loan_, uint256 principal_, uint256 netInterest_)'
  })
  const logs_claim_funds = await getLogs({
    targets: contract_open_term_loan,
    eventAbi: 'event ClaimedFundsDistributed(address indexed loan_, uint256 principal_, uint256 netInterest_, uint256 delegateManagementFee_, uint256 delegateServiceFee_, uint256 platformManagementFee_, uint256 platformServiceFee_)'
  })
  console.log(logs_claim_funds.length, logs_funds_distribution.length, logsTranferERC20.length)

  logs_funds_distribution.map((e: any, index: number) => {
    const isEthBase = contract_loan_mangaer[index].toLowerCase() === eth_base.toLowerCase();
    const token = isEthBase ? [ADDRESSES.ethereum.WETH]: ADDRESSES.ethereum.USDC
    e.forEach((i: any) => dailyFees.add(token, i.netInterest_))
  })

  logs_claim_funds.map((e: any) => dailyFees.add(ADDRESSES.ethereum.USDC, e.netInterest_))
  logsTranferERC20.forEach((b: any) => {
    dailyFees.add(b.contract_address, b.value)
    dailyRevenue.add(b.contract_address, b.value)
  });
  return { dailyFees, dailyRevenue, timestamp }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees as any,
      start: 1672531200
    }
  }
}
export default adapters;
