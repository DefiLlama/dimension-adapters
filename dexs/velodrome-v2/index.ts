import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";
const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)';

export default uniV2Exports({
  [CHAIN.OPTIMISM]: { factory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a', swapEvent, },
  [CHAIN.MODE]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.LISK]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.FRAXTAL]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.INK]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.BOB]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.SONEIUM]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.UNICHAIN]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.SWELLCHAIN]: {factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
  [CHAIN.CELO]: {factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, },
})
