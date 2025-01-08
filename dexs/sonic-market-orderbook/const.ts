import {CHAIN} from "../../helpers/chains";

export const CONTRACT_INFOS: Record<string, any> = {
  [CHAIN.SONIC]: {
    bookManagerContract: {
      address: '0xD4aD5Ed9E1436904624b6dB8B1BE31f36317C636',
      fromBlock: 297198,
      abi: {
        openEvent: 'event Open(uint192 indexed id, address indexed base, address indexed quote, uint64 unitSize, uint24 makerPolicy, uint24 takerPolicy, address hooks)',
        takeEvent: 'event Take(uint192 indexed bookId, address indexed user, int24 tick, uint64 unit)'
      }
    }
  },
}

export const zeroAddress = '0x0000000000000000000000000000000000000000'
