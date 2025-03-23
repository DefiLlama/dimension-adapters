
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const event_ccpt = 'event CCTPTransferSent(uint64 indexed cctpNonce,uint256 indexed chainId,address indexed recipient,uint256 amount,uint256 bonderFee)'
const event_bond = 'event TransferSent(bytes32 indexed transferId,uint256 indexed chainId,address indexed recipient,uint256 amount,bytes32 transferNonce,uint256 bonderFee,uint256 index,uint256 amountOutMin,uint256 deadline)'

const contract_ccpt: any = {
    [CHAIN.ARBITRUM]: '0x6504bfcab789c35325ca4329f1f41fac340bf982' // usdc
}

const contract_bond: any = {
    [CHAIN.ARBITRUM]: [
        '0x7aC115536FE3A185100B2c4DE4cb328bf3A58Ba6',
        '0x3749C4f034022c39ecafFaBA182555d4508caCCC',
        '0x25FB92E505F752F730cAD0Bd4fa17ecE4A384266',
        '0xEa5abf2C909169823d939de377Ef2Bf897A6CE98',
        '0xc315239cfb05f1e130e7e28e603cea4c014c57f0',
        '0x0e0E3d2C5c292161999474247956EF542caBF8dd',
        '0x6504bfcab789c35325ca4329f1f41fac340bf982',
        '0x72209Fe68386b37A40d6bCA04f78356fd342491f'
    ]
}

const mapping_token: any = {
    [CHAIN.ARBITRUM]: {
        '0x7aC115536FE3A185100B2c4DE4cb328bf3A58Ba6': '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        '0x3749C4f034022c39ecafFaBA182555d4508caCCC': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        '0x25FB92E505F752F730cAD0Bd4fa17ecE4A384266': '0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC',
        '0xEa5abf2C909169823d939de377Ef2Bf897A6CE98': '0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A',
        '0xc315239cfb05f1e130e7e28e603cea4c014c57f0': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        '0x0e0E3d2C5c292161999474247956EF542caBF8dd': '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        '0x6504bfcab789c35325ca4329f1f41fac340bf982': '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        '0x72209Fe68386b37A40d6bCA04f78356fd342491f': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
    }
}

const token_chain: any = {
    [CHAIN.ARBITRUM]: '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
}

const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    eventAbi: event_ccpt,
    target: contract_ccpt[options.chain],
  })

  const logs_bond = await options.getLogs({
    eventAbi: event_bond,
    targets: contract_bond[options.chain],
    flatten: false
  })
  
  logs.forEach((log) => dailyFees.add(token_chain[options.chain], log.bonderFee))
  logs_bond.forEach((logs, index) => {
    logs.forEach((log: any) => {
      const hop_contract = contract_bond[options.chain][index]
      const token_2 = mapping_token[options.chain][hop_contract]
      dailyFees.add(token_2, log.bonderFee)
    })
  })
  
  return { dailyFees };
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: '2023-01-01'
    }
  }
}

export default adapter;