import { SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getFeesExport } from '../helpers/friend-tech'

const contract_address = '0x87da6930626fe0c7db8bc15587ec0e410937e5dc'
const event_trade = 'event Trade(address trader,address subject,bool isBuy,uint256 shareAmount,uint256 ethAmount,uint256 protocolEthAmount,uint256 subjectEthAmount,uint256 holderEthAmount,uint256 referralEthAmount,uint256 supply)';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFeesExport(contract_address, [event_trade]),
      start: '2023-08-29',
    }
  },
  version: 2,
  methodology: {
      Fees: "Fees paid by users while trading on social network.",
      Revenue: "Fees paid by users while trading on social network.",
  }
}

export default adapter;
