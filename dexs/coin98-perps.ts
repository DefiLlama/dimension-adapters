import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://coin98.com/

const START = '2025-09-26';
const HL_BUILDER_ADDRESS = '0x3342ee6851ef0ec3cf42658c2be3b28a905271aa';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
