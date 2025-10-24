import {FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {Balances} from "@defillama/sdk";

const WormholeAbis = {
  StandardRelayer: 'event SendEvent(uint64 indexed sequence, uint256 deliveryQuote, uint256 paymentForExtraReceiverValue)',
  ExecutorFee: 'event RequestForExecution(address indexed quoterAddress, uint256 amtPaid, uint16 dstChain, bytes32 dstAddr, address refundAddr, bytes signedQuote, bytes requestBytes, bytes relayInstructions)',
}
// TODO: add start date of each contract
const WormholeExecutorContracts: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x84EEe8dBa37C36947397E1E11251cA9A06Fc6F8a',
  // [CHAIN.SOLANA]: 'execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV',
  // [CHAIN.APTOS]: '0x11aa75c059e1a7855be66b931bf340a2e0973274ac16b5f519c02ceafaf08a18',
  [CHAIN.ARBITRUM]: '0x3980f8318fc03d79033Bbb421A622CDF8d2Eeab4',
  [CHAIN.AVAX]: '0x4661F0E629E4ba8D04Ee90080Aee079740B00381',
  [CHAIN.BASE]: '0x9E1936E91A4a5AE5A5F75fFc472D6cb8e93597ea',
  [CHAIN.BERACHAIN]: '0x0Dd7a5a32311b8D87A615Cc7f079B632D3d5e2D3',
  [CHAIN.BSC]: '0xeC8cCCD058DbF28e5D002869Aa9aFa3992bf4ee0',
  [CHAIN.CELO]: '0xe6Ea5087c6860B94Cf098a403506262D8F28cF05',
  // [CHAIN.CREDIT_COIN]:	                '0xd2e420188f17607Aa6344ee19c3e76Cf86CA7BDe', not available in defillama yet
  [CHAIN.HYPERLIQUID]: '0xd7717899cc4381033Bc200431286D0AC14265F78',
  [CHAIN.INK]: '0x3e44a5F45cbD400acBEF534F51e616043B211Ddd',
  [CHAIN.LINEA]: '0x23aF2B5296122544A9A7861da43405D5B15a9bD3',
  [CHAIN.MEZO]: '0x0f9b8E144Cc5C5e7C0073829Afd30F26A50c5606',
  [CHAIN.MOONBEAM]: '0x85D06449C78064c2E02d787e9DC71716786F8D19',
  [CHAIN.OPTIMISM]: '0x85B704501f6AE718205C0636260768C4e72ac3e7',
  [CHAIN.POLYGON]: '0x0B23efA164aB3eD08e9a39AC7aD930Ff4F5A5e81',
  [CHAIN.SCROLL]: '0xcFAdDE24640e395F5A71456A825D0D7C3741F075',
  [CHAIN.SEI]: '0x25f1c923fb7a5aefa5f0a2b419fc70f2368e66e5',
  [CHAIN.SONIC]: '0x3Fdc36b4260Da38fBDba1125cCBD33DD0AC74812',
  // [CHAIN.SUI]: '0xdb0fe8bb1e2b5be628adbea0636063325073e1070ee11e4281457dfd7f158235',
  [CHAIN.UNICHAIN]: '0x764dD868eAdD27ce57BCB801E4ca4a193d231Aed',
  [CHAIN.WC]: '0x8689b4E6226AdC8fa8FF80aCc3a60AcE31e8804B',
  [CHAIN.XRPL_EVM]: '0x8345E90Dcd92f5Cf2FAb0C8E2A56A5bc2c30d896',
}


// TODO: add start date of each contract

// Source: https://wormhole.com/docs/products/reference/contract-addresses/#wormhole-relayer
const WormholeStandardRelayerContracts: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.ARBITRUM]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.AVAX]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.BASE]: '0x706f82e9bb5b0813501714ab5974216704980e31',
  [CHAIN.BERACHAIN]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.BSC]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.CELO]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.FANTOM]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.INK]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.KLAYTN]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.MANTLE]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.MEZO]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.MOONBEAM]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.OPTIMISM]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.PLUME]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.POLYGON]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.SCROLL]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.SEI]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.UNICHAIN]: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.WC]: '0x1520cc9e779c56dab5866bebfb885c86840c33d3',
  // [CHAIN.XLAYER]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
}

const fetchExecutorFees = async (options: FetchOptions, dailyFees: Balances): Promise<void> => {

  // TODO : check first if options.chain is available in the contracts array
  const feeEvents: Array<any> = await options.getLogs({
    target: WormholeExecutorContracts[options.chain],
    eventAbi: WormholeAbis.ExecutorFee,
  })
  console.log(options.chain);
  console.log(feeEvents);
  for (const event of feeEvents) {
    dailyFees.addGasToken(event.amtPaid)
  }
};

const fetch: any = async (options: FetchOptions): Promise<FetchResultFees> => {

  const dailyFees = options.createBalances()

  await fetchExecutorFees(options, dailyFees);

  // const feeEvents: Array<any> = await options.getLogs({
  //   target: WormholeStandardRelayerContracts[options.chain],
  //   eventAbi: WormholeAbis.StandardRelayer,
  // })
  // console.log(options.chain);
  // console.log(feeEvents);
  // for (const event of feeEvents) {
  //   dailyFees.addGasToken(event.deliveryQuote)
  // }

  return {dailyFees, dailyRevenue: 0, dailyProtocolRevenue: 0}
};

const adapter: SimpleAdapter = {
  version: 2,
  // adapter: Object.keys(WormholeStandardRelayerContracts).reduce((acc, chain) => {
  adapter: Object.keys(WormholeExecutorContracts).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch, start: '2025-01-10',
      }
    }
  }, {}),
  methodology: {
    Fees: 'Total fees paid by users by using Wormhole Standard relayers or Request for Execution.',
    Revenue: 'Wormhole has no revenue as it takes 0 fees at the moment for message relaying.',
    ProtocolRevenue: 'Wormhole has no revenue as it takes 0 fees at the moment for message relaying.',
  }
};

export default adapter;
