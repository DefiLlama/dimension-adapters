
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a';

const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)';
export const fetchV2 = getDexVolumeExports({ swapEvent, factory: FACTORY_ADDRESS, chain: 'optimism', pairItemAbi: 'allPools', pairLengthAbi: 'allPoolsLength' })