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

const fetchFees = async (options: FetchOptions) => {
  const { getLogs } = options
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const logsTranferERC20: any[] = await queryIndexer(`
        SELECT DISTINCT
          '0x' || encode(data, 'hex') AS value,
          '0x' || encode(contract_address, 'hex') AS contract_address,
          '0x' || encode(topic_1, 'hex') AS from_address,
          '0x' || encode(topic_2, 'hex') AS to_address
        FROM
          ethereum.event_logs
        WHERE
          topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND (
            -- Maple Treasury
            topic_2 = '\\x000000000000000000000000a9466eabd096449d650d5aeb0dd3da6f52fd0b19'
            -- Blue Chip Secured
            OR topic_2 = '\\x000000000000000000000000d15b90ff80aa7e13fc69cd7ccd9fef654495e36c'
            -- Specific from/to combinations
            OR (topic_2 = '\\x0000000000000000000000006d7f31cdbe68e947fafacad005f6495eda04cb12' AND topic_1 = '\\x000000000000000000000000dc9b93a8a336fe5dc9db97616ea2118000d70fc0')
            OR (topic_2 = '\\x0000000000000000000000000984af3fcb364c1f30337f9ab453f876e7ff6d0b' AND topic_1 NOT IN ('\\x000000000000000000000000d15b90ff80aa7e13fc69cd7ccd9fef654495e36c', '\\x0000000000000000000000006d7f31cdbe68e947fafacad005f6495eda04cb12'))
            -- Corporate USDC
            OR topic_2 = '\\x000000000000000000000000687f2c038e2daa38f8dac0c5941d7b5e58bd8ca6'
            OR (topic_2 = '\\x000000000000000000000000eb636ff0b27c2ee99731cb0588db6db76da6e06e' AND topic_1 != '\\x000000000000000000000000687f2c038e2daa38f8dac0c5941d7b5e58bd8ca6')
            -- Corporate WETH
            OR topic_2 = '\\x000000000000000000000000cb8770923b71b0c60c47f1b352991c7ea0b4be0f'
            OR (topic_2 = '\\x0000000000000000000000006d03aa567ae55fad71fd58d9a4ba44d9dc6adc5f' AND topic_1 != '\\x000000000000000000000000cb8770923b71b0c60c47f1b352991c7ea0b4be0f')
            -- High Yield Secured
            OR topic_2 = '\\x0000000000000000000000007263d9cd36d5cae7b681906c0e29a4a94c0938a9'
            OR (topic_2 = '\\x0000000000000000000000008c6a34e2b9cecee4a1fce672ba37e611b1aecebb' AND topic_1 != '\\x0000000000000000000000007263d9cd36d5cae7b681906c0e29a4a94c0938a9')
            -- Syrup USDC
            OR (topic_2 = '\\x000000000000000000000000ee3cbeff9dc14ec9710a643b7624c5beaf20bccb' AND topic_1 NOT IN ('\\x0000000000000000000000006c73b1ca08bbc3f44340603b1fb9e331c2abaca7', '\\x000000000000000000000000bc56c29b8a17e49735317a6a247dff66078c40c6', '\\x00000000000000000000000019ffdcec0d4b605bfa1c34475821ef06a38b6e93'))
            -- Syrup USDT
            OR (topic_2 = '\\x000000000000000000000000e512acb671cce2c976b151dec89f9aaf701bb006' AND topic_1 NOT IN ('\\x00000000000000000000000049ec042fd777fddf90a249f1194d3e124d49867f', '\\x0000000000000000000000006d7774ca8c41d614fee0e0c91a206fa2a10f8264'))
          )
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

  logs_funds_distribution.map((e: any, index: number) => {
    const isEthBase = contract_loan_mangaer[index].toLowerCase() === eth_base.toLowerCase();
    const token = isEthBase ? [ADDRESSES.ethereum.WETH] : ADDRESSES.ethereum.USDC
    e.forEach((i: any) => {
      dailyFees.add(token, i.netInterest_)
      dailySupplySideRevenue.add(token, i.netInterest_)
    })
  })

  logs_claim_funds.map((e: any) => {
    dailyFees.add(ADDRESSES.ethereum.USDC, e.netInterest_)
    dailySupplySideRevenue.add(ADDRESSES.ethereum.USDC, e.netInterest_)
  })

  // Filter for specific tokens (USDC, WETH, USDT) during processing
  const allowedTokens = [
    ADDRESSES.ethereum.USDC, // USDC
    ADDRESSES.ethereum.WETH, // WETH
    ADDRESSES.ethereum.USDT  // USDT
  ];

  logsTranferERC20.forEach((b: any) => {
    if (allowedTokens.includes(b.contract_address.toLowerCase())) {
      dailyFees.add(b.contract_address, b.value)
      dailyRevenue.add(b.contract_address, b.value)
    }
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees as any,
      start: '2023-01-01',
    }
  },
  methodology: {
    Fees: "Total interest and fees paid by borrowers on loans, including net interest from loan distributions and open-term loan claims.",
    UserFees: "Interest and fees paid by borrowers when taking loans from Maple pools. This includes net interest on both traditional loan manager contracts and open-term loans.",
    Revenue: "Total revenue flowing to Maple protocol treasuries, including fees from loan management, delegate fees, and platform fees collected from various pool strategies.",
    ProtocolRevenue: "Total revenue flowing to Maple protocol treasuries.",
    SupplySideRevenue: "Interest earned by liquidity providers/depositors in Maple pools from net interest distributions on loans.",
  }
}
export default adapters;
