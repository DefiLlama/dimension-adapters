import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://gtr.trade/

const START = '2025-06-17';
const HL_BUILDER_ADDRESS = '0x5ef4deeb76f87d979d0ddc8c51f5b4f65d1c972a';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
