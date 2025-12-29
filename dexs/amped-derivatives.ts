import adapter from './amped/index'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['derivatives'],
}
