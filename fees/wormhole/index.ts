import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {Balances} from "@defillama/sdk";

const WormholeAbis = {
  StandardRelayer: 'event SendEvent(uint64 indexed sequence, uint256 deliveryQuote, uint256 paymentForExtraReceiverValue)',
  ExecutorFee: 'event RequestForExecution(address indexed quoterAddress, uint256 amtPaid, uint16 dstChain, bytes32 dstAddr, address refundAddr, bytes signedQuote, bytes requestBytes, bytes relayInstructions)',
}
// TODO: add start date of each contract
const WormholeExecutorContracts: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x84eee8dba37c36947397e1e11251ca9a06fc6f8a',

}
// TODO: add start date of each contract

const WormholeStandardRelayerContracts: Record<string, string> = {
  [CHAIN.ETHEREUM]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.ARBITRUM]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.AVAX]:	          '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.BASE]:	                  '0x706f82e9bb5b0813501714ab5974216704980e31',
  [CHAIN.BERACHAIN]:	          '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.BSC]:	      '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.CELO]:	                  '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.FANTOM]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.INK]:	                  '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.KLAYTN]:	                  '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.MANTLE]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.MEZO]:	                  '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.MOONBEAM]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.OPTIMISM]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.PLUME]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.POLYGON]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.SCROLL]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.SEI]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.UNICHAIN]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  [CHAIN.WC]:	          '0x1520cc9e779c56dab5866bebfb885c86840c33d3',
  // [CHAIN.XLAYER]:	              '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
}

const fetchExecutorFees = async (options: FetchOptions, dailyFees: Balances): Promise<void> => {

  // TODO : check first if options.chain is available in the contracts array
  const feeEvents: Array<any> = await options.getLogs({
    target: WormholeExecutorContracts[options.chain],
    eventAbi: WormholeAbis.ExecutorFee,
  })
  console.log(feeEvents);
  for (const event of feeEvents) {
    dailyFees.addGasToken(event.amtPaid)
  }
};

const fetch: any = async (options: FetchOptions): Promise<FetchResultFees> => {

  const dailyFees = options.createBalances()

  // await fetchExecutorFees(options, dailyFees);

  const feeEvents: Array<any> = await options.getLogs({
    target: WormholeStandardRelayerContracts[options.chain],
    eventAbi: WormholeAbis.StandardRelayer,
  })
  console.log(options.chain);
  console.log(feeEvents);
  for (const event of feeEvents) {
    dailyFees.addGasToken(event.deliveryQuote)
  }

  return { dailyFees, dailyRevenue: 0, dailyProtocolRevenue: 0 }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(WormholeStandardRelayerContracts).reduce((acc, chain) => {
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
