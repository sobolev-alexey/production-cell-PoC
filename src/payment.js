const format = require ('date-fns/format')
const { composeAPI, generateAddress } = require('@iota/core')
const { extractMessage } = require('./mq')
const { addData, queryData, connect } = require('./postgres')
const { getFormattedTimestamp } = require('./helpers')
const { provider, mq: { paymentQueue } } = require('../config.json')

let lastTransactionAddress
let transactionStartTimestamp
const cellID = 1

const sleep = delay => new Promise(resolve => setTimeout(resolve, delay))

const transferFunds = async (buyer, seller, amount, seed) => {
  try {
    const { owner, address, keyindex } = buyer
    const { getBalances, prepareTransfers, sendTrytes, getLatestInclusion } = composeAPI({ provider })
    const { balances } = await getBalances([ address ], 100)
    const keyIndex = Number(keyindex)

    const security = 2
    const balance = balances && balances.length > 0 ? balances[0] : 0

    // Depth or how far to go for tip selection entry point
    const depth = 5

    // Difficulty of Proof-of-Work required to attach transaction to tangle.
    // Minimum value on mainnet & spamnet is `14`, `9` on devnet and other testnets.
    // For the small private Tangle can be set to 0 or 1
    const minWeightMagnitude = 9

    if (balance === 0) {
      console.error(`transferFunds ${cellID}. Insufficient balance`, address, balances)
      // Add new payment entry to DB
      await addData(`payments_${cellID}`, [owner, seller.owner, amount, balance - amount, Number(seller.balance) + amount, 'error. Insufficient balance', transactionStartTimestamp, getFormattedTimestamp()])

      return 'error. Insufficient balance'
    }

    const transfers = [{ address: seller.address, value: amount }]
    const remainderAddress = generateAddress(seed, keyIndex + 1)
    const options = {
      inputs: [{
        address,
        keyIndex,
        security,
        balance
      }],
      security,
      remainderAddress
    };

    // update lastTransactionAddress
    lastTransactionAddress = remainderAddress

    try {
      const trytes = await prepareTransfers(seed, transfers, options)
      const transactions = await sendTrytes(trytes, depth, minWeightMagnitude)
      const hashes = transactions.map(transaction => transaction.hash)

      let counter = 0
      let transactionConfirmed = false

      while (counter++ < 109) {
        const transactionStatusTimestamp = getFormattedTimestamp()
        if (counter >= 108) {  // 540 seconds = 9 min
          // Add new payment status entry to DB
          await addData(`payments_${cellID}`, [owner, seller.owner, amount, balance - amount, Number(seller.balance) + amount, 'pending', transactionStartTimestamp, transactionStatusTimestamp])
          return 'retry'
        }

        if (counter === 0 || counter > 60) {
          console.log(`sendTrytes ${cellID} status: pending`, counter, remainderAddress, transactionStatusTimestamp)
        }

        // check if previous transaction already confirmed
        const statuses = await getLatestInclusion(hashes)
        if (statuses.filter(status => status).length === 4) break;
        await new Promise(resolved => setTimeout(resolved, 5000));
      }

      const transactionEndTimestamp = getFormattedTimestamp()
      console.log(`transferFunds ${cellID} updating`, owner, remainderAddress, keyIndex + 1, amount, transactionEndTimestamp)

      // update buyer address and keyIndex
      await addData(`wallets_${cellID}`, [owner, remainderAddress, keyIndex + 1, balance - amount, transactionEndTimestamp])

      // Add new payment entry to DB
      await addData(`payments_${cellID}`, [owner, seller.owner, amount, balance - amount, Number(seller.balance) + amount, 'confirmed', transactionStartTimestamp, transactionEndTimestamp])

      // update seller address and keyIndex
      await addData(`wallets_${cellID}`, [seller.owner, seller.address, Number(seller.keyindex), Number(seller.balance) + amount, getFormattedTimestamp()])

      return 'success'
    } catch (error) {
      console.error(`transferFunds ${cellID} prepareTransfers error`, error)
      // Add new payment entry to DB
      await addData(`payments_${cellID}`, [owner, seller.owner, amount, balance - amount, Number(seller.balance) + amount, `retry. ${String(error).substring(0, 90)}`, transactionStartTimestamp, getFormattedTimestamp()])

      return 'retry'
    };
  } catch (error) {
    console.error(`transferFunds ${cellID} catch`, error)
    return 'error'
  }
}

const processPayment = async (buyerId, sellerId, amount) => {
  if (amount <= 0) {
    console.log(`processPayment ${cellID} with zero value`, buyerId, sellerId, amount)
    return null
  }
  // retrieve wallets
  const buyer = await queryData(`wallets_${cellID}`, buyerId)
  const seller = await queryData(`wallets_${cellID}`, sellerId)
  const seed = await queryData('seeds', `${buyerId}_${cellID}`)

  // make payment
  let paymentProcess = 'retry'
  let retryCount = 0
  transactionStartTimestamp = getFormattedTimestamp()
  while (paymentProcess === 'retry' && retryCount < 2) {
    paymentProcess = await transferFunds(buyer, seller, Number(amount), seed.seed)
    if (paymentProcess === 'retry') {
      retryCount++
      console.error('processPayment', cellID, paymentProcess, buyer, seller, Number(amount), lastTransactionAddress, getFormattedTimestamp());
    } else {
      console.log('processPayment', cellID, paymentProcess, buyerId, sellerId, Number(amount), lastTransactionAddress, getFormattedTimestamp())
      break
    }
  }
  transactionStartTimestamp = null
};


const processPayments = async () => {
  try {
    await extractMessage(`${paymentQueue}${cellID}`)
      .then(async data => {
        if (data.length !== 3) {
          console.error('Not enough params', data)
          return null
        }
        console.log(`processPayments ${cellID}`, ...data, getFormattedTimestamp())
        await processPayment(...data)
      })
      .catch(error => {
        console.error(error)
      })
  } catch (error) {
    console.error(`processPayments ${cellID} catch`, error)
  }
};

connect()

processPayments()
setInterval(processPayments, 600000)

module.exports = {
  processPayments
}
