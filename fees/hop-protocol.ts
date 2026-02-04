import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const event_ccpt = 'event CCTPTransferSent(uint64 indexed cctpNonce,uint256 indexed chainId,address indexed recipient,uint256 amount,uint256 bonderFee)'
const event_bond = 'event TransferSent(bytes32 indexed transferId,uint256 indexed chainId,address indexed recipient,uint256 amount,bytes32 transferNonce,uint256 bonderFee,uint256 index,uint256 amountOutMin,uint256 deadline)'
const event_l1 = 'event TransferSentToL2(uint256 indexed chainId,address indexed recipient,uint256 amount,uint256 amountOutMin,uint256 deadline,address indexed relayer,uint256 relayerFee)'
const event_l1_com ='event TransferFromL1Completed(address indexed recipient,uint256 amount,uint256 amountOutMin,uint256 deadline,address indexed relayer,uint256 relayerFee)'
type IRequest = {
    [key: string]: Promise<any>;
}
const requests: IRequest = {}

const fetchCacheURL = (url: string) => {
    const key = url;
    if (!requests[key]) {
        requests[key] = httpGet(url);
    }
    return requests[key];
}

const fetchFeesL1 = async (options: FetchOptions): Promise<FetchResultV2> => {
    const config = await fetchCacheURL('https://s3.us-west-1.amazonaws.com/assets.hop.exchange/mainnet/v1-core-config.json')
    const l1_bridges = Object.values(config.bridges).map((e: any) => e[options.chain]).filter(Boolean)
    const contract_bond: string[] = l1_bridges.map((e: any) => e.l1Bridge || e.cctpL1Bridge).filter(Boolean)
    const mapping_token = l1_bridges.map((e: any) => {
      return {
        [e.l1Bridge || e.cctpL1Bridge]: e.l1CanonicalToken
      }
    }).filter(Boolean)
    const logs_ccpt = await options.getLogs({
      eventAbi: event_ccpt,
      targets: contract_bond,
      flatten: false
    })
    const logs_l1 = await options.getLogs({
      eventAbi: event_l1,
      targets: contract_bond,
      flatten: false
    })

    const dailyFees = options.createBalances()
    logs_ccpt.forEach((logs, index) => {
      logs.forEach((log: any) => {
        const hop_contract = contract_bond[index]
        const token_l2: any = mapping_token.find((e: any) => e[hop_contract])
        dailyFees.add(token_l2[hop_contract], log.bonderFee, { label: 'cctp-bonder-fees' })
      })
    })

    logs_l1.forEach((logs, index) => {
      logs.forEach((log: any) => {
        const hop_contract = contract_bond[index]
        const token_l2: any = mapping_token.find((e: any) => e[hop_contract])
        dailyFees.add(token_l2[hop_contract], log.relayerFee, { label: 'l1-relayer-fees' })
      })
    })
    return { dailyFees };
}

  
const fetchFeesL2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const config = await fetchCacheURL('https://s3.us-west-1.amazonaws.com/assets.hop.exchange/mainnet/v1-core-config.json')
  const l2_bridges = Object.values(config.bridges).map((e: any) => e[options.chain]).filter(Boolean)
  const contract_bond: string[] = l2_bridges.map((e: any) => e.l2Bridge).filter(Boolean)
  const mapping_token = l2_bridges.map((e: any) => {
    return {
      [e.l2Bridge]: e.l2CanonicalToken
    }
  }).filter(Boolean)
  const contract_ccpt: string[] = l2_bridges.map((e: any) => e.cctpL2Bridge).filter(Boolean)
  const mapping_token_ccp = l2_bridges.map((e: any) => {
    return {
      [e.cctpL2Bridge]: e.l2CanonicalToken
    }
  }).filter(Boolean)
  contract_bond.concat(contract_ccpt)
  mapping_token.concat(mapping_token_ccp)

  const logs_ccpt = await options.getLogs({
    eventAbi: event_ccpt,
    targets: contract_bond,
    flatten: false
  })

  const logs_bond = await options.getLogs({
    eventAbi: event_bond,
    targets: contract_bond,
    flatten: false
  })

  const logs_tran_l1_com = await options.getLogs({
    eventAbi: event_l1_com,
    targets: contract_bond,
    flatten: false
  })

  logs_tran_l1_com.forEach((logs, index) => {
    logs.forEach((log: any) => {
      const hop_contract = contract_bond[index]
      const token_l2: any = mapping_token.find((e: any) => e[hop_contract])
      dailyFees.add(token_l2[hop_contract], log.relayerFee, { label: 'l2-relayer-fees' })
    })
  })


  logs_ccpt.forEach((logs, index) => {
    logs.forEach((log: any) => {
      const hop_contract = contract_bond[index]
      const token_l2: any = mapping_token.find((e: any) => e[hop_contract])
      dailyFees.add(token_l2[hop_contract], log.bonderFee, { label: 'cctp-bonder-fees' })
    })
  })


  logs_bond.forEach((logs, index) => {
    logs.forEach((log: any) => {
      const hop_contract = contract_bond[index]
      const token_l2: any = mapping_token.find((e: any) => e[hop_contract])
      dailyFees.add(token_l2[hop_contract], log.bonderFee, { label: 'transfer-bonder-fees' })
    })
  })
  
  return { dailyFees };
}

const adapter: SimpleAdapter = {
  methodology: {
    Fees: 'Fees paid by users for bridging tokens via Hop.',
  },
  breakdownMethodology: {
    Fees: {
      'cctp-bonder-fees': 'Bonder fees collected from CCTP (Cross-Chain Transfer Protocol) bridge transfers.',
      'l1-relayer-fees': 'Relayer fees collected from L1 transfer events sent to L2.',
      'l2-relayer-fees': 'Relayer fees collected from transfers completed from L1 on L2 chains.',
      'transfer-bonder-fees': 'Bonder fees collected from standard Hop bridge transfers on L2 chains.',
    },
  },
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFeesL2,
      start: '2023-01-01',
    },
    [CHAIN.BASE]: {
      fetch: fetchFeesL2,
      start: '2023-01-01',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFeesL2,
      start: '2023-01-01',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFeesL2,
      start: '2023-01-01',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFeesL1,
      start: '2023-01-01',
    }
  }
}

export default adapter;