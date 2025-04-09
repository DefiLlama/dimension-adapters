import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from '@defillama/sdk'

/**
 * 
 * Ondo manages and issues two stable assets: USDY and OUSG, both work in the same mechanism
 * 
 * The price of OUSG, USDY increase from accrued yields, we count these yields are fees
 * 
 * No management fees on Ondo for now:
 * https://docs.ondo.finance/qualified-access-products/ousg/fees-and-taxes#what-fees-does-ousg-charge
 * https://docs.ondo.finance/general-access-products/usdy/faq/economics-and-fees#what-fees-does-usdy-charge
 */

const methodology = {
  Fees: 'Total yields were collected by investment assets.',
  SupplySideRevenue: 'Total yields were distributed to investors.',
}

const OUSG = '0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92'
const OracleOUSG = '0x0502c5ae08E7CD64fe1AEDA7D6e229413eCC6abe'

const USDY = '0x96F6eF951840721AdBF46Ac996b59E0235CB985C'
const OracleUSDY = '0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0'

const OndoAbis = {
  totalSupply: 'uint256:totalSupply',
  getPrice: 'uint256:getPrice',
  OracleOUSGUpdatedEvent: 'event RWAExternalComparisonCheckPriceSet(int256, uint80 indexed, int256, uint80 indexed, int256, int256)',
}

interface OusgOracleUpdateEvent {
  increasedRate: number;
  blockNumber: number;
}

const fetch: any = async (options: FetchOptions) => {
  // USD value
  let dailyFees = 0

  // get fees from OUSG
  const ousgOracleContract: Interface = new Interface([
    OndoAbis.OracleOUSGUpdatedEvent,
  ])
  const events: Array<OusgOracleUpdateEvent> = (await options.getLogs({
    eventAbi: OndoAbis.OracleOUSGUpdatedEvent,
    entireLog: true,
    target: OracleOUSG,
  }))
  .map(log => {
    const decodeLog: any = ousgOracleContract.parseLog(log)
    return {
      blockNumber: Number(log.blockNumber),
      increasedRate: Number(decodeLog.args[5]) - Number(decodeLog.args[4]),
    }
  })
  for (const event of events) {
    // this event occurs daily once, no need to worry about rpc calls
    const totalSupply = await sdk.api2.abi.call({
      abi: OndoAbis.totalSupply,
      target: OUSG,
      block: event.blockNumber - 1,
    })
    dailyFees += Number(totalSupply) * event.increasedRate / 1e36
  }

  // get fees from USDY
  const oldPrice = await options.fromApi.call({
    abi: OndoAbis.getPrice,
    target: OracleUSDY,
  })
  const newPrice = await options.toApi.call({
    abi: OndoAbis.getPrice,
    target: OracleUSDY,
  })
  const totalSupply = await sdk.api2.abi.call({
    abi: OndoAbis.totalSupply,
    target: USDY,
  })
  const increasePrice = Number(newPrice) - Number(oldPrice)
  dailyFees += Number(totalSupply) * increasePrice / 1e36

  return { 
    dailyFees, 
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { 
      fetch,
      start: '2023-04-26',
      meta: {
        methodology,
      }
    },
  },
}

export default adapter
