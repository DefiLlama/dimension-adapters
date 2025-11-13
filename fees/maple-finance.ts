import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryIndexer } from "../helpers/indexer";

const contract_open_term_loan_manager_stablecoin: string[] = [
  '0x2638802a78d6a97d0041cc7b52fb9a80994424cd',
  '0x483082e93635ef280bc5e9f65575a7ff288aba33',
  '0xdc9b93a8a336fe5dc9db97616ea2118000d70fc0',
  '0xfab269cb4ab4d33a61e1648114f6147742f5eecc',
  '0x9ab77dbd4197c532f9c9f30a7e83a710e03da70a',
  '0x616022e54324ef9c13b99c229dac8ea69af4faff',
  '0x6aceb4caba81fa6a8065059f3a944fb066a10fac',
  '0x56ef41693f69d422a88cc6492888a1bd41923d33',
  '0xb50d675f3c6d18ce5ccac691354f92afebd1675e'
]
const contract_open_term_loan_manager_eth = '0xe3aac29001c769fafcef0df072ca396e310ed13b';

const CLAIMED_FUNDS_DISTRIBUTED_EVENT = 'event ClaimedFundsDistributed(address indexed loan_, uint256 principal_, uint256 netInterest_, uint256 delegateManagementFee_, uint256 delegateServiceFee_, uint256 platformManagementFee_, uint256 platformServiceFee_)';

function getHoldersRevenueShare(date: number): number {
  if (date < 1761955200) { // 2025-11-01
    return 0 
  } else {
    return 0.25;
  }
}

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

  const logs_claim_funds_stablecoin = await getLogs({
    targets: contract_open_term_loan_manager_stablecoin,
    eventAbi: CLAIMED_FUNDS_DISTRIBUTED_EVENT,
  })

  logs_claim_funds_stablecoin.map((e: any) => {
    dailyFees.add(ADDRESSES.ethereum.USDC, e.netInterest_)
    dailySupplySideRevenue.add(ADDRESSES.ethereum.USDC, e.netInterest_)
  })

  const logs_claim_funds_eth = await getLogs({
    target: contract_open_term_loan_manager_eth,
    eventAbi: CLAIMED_FUNDS_DISTRIBUTED_EVENT,
  })

  logs_claim_funds_eth.map((e: any) => {
    dailyFees.add(ADDRESSES.ethereum.WETH, e.netInterest_)
    dailySupplySideRevenue.add(ADDRESSES.ethereum.WETH, e.netInterest_)
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
  
  const holdersShare = getHoldersRevenueShare(options.startOfDay);
  const dailyHoldersRevenue = dailyRevenue.clone(holdersShare);
  const dailyProtocolRevenue = dailyRevenue.clone(1 - holdersShare);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue, 
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
    HoldersRevenue: "Maple use 25% from protocol revenue to buy back SYRUP tokens from MIP-019.",
  }
}
export default adapters;
