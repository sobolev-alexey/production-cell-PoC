const https = require('https')
const format = require ('date-fns/format')
const { testMode, costkWh, defaultTokenPrice, priceURL } = require('../config.json')

const getFormattedTimestamp = () => format(Date.now(), 'YYYY-MM-DDTHH:mm:ss')

const getCurrentIotaPrice = async () => {
  const promise = new Promise((resolve, reject) => {
    try {
      https.get(priceURL, response => {
        let data = ''
        response.on('data', chunk => data += chunk)

        response.on('end', () => {
          const result = JSON.parse(data)
          resolve(result && result.EUR || defaultTokenPrice)
        });

      }).on('error', error => reject(error))
    } catch (error) {
      return reject(error)
    }
  })
  return promise
}

const calculateEnergyCostInIota = (energy, price) => {
  // Cost of 1 kWh in IOTA
  const iotaPerkWh = 1000000 * costkWh / price
  const factor = testMode ? 1000000 : 1000

  // Total amount of IOTA to pay for consumed energy, given the current price
  let cost = Math.round(energy * iotaPerkWh / factor)

  while (cost < 10) {
    cost = Math.round(cost * 5)
  }

  while (cost > 200000) {
    cost = Math.round(cost / 5)
  }

  return cost
}

module.exports = {
  calculateEnergyCostInIota,
  getCurrentIotaPrice,
  getFormattedTimestamp,
}
