const { Client } = require('pg')
const { postgresClient } = require('../credentials.json')

const client = new Client(postgresClient)

const connect = () => client.connect()
const disconnect = () => client.end()

const getTableSchema = table => {
  if (table.indexOf('robot') > -1) {
      return `INSERT INTO ${table}(power, energy, time, timestamp, timestamp1) VALUES($1, $2, $3, $4, $5) RETURNING *`
  } else if (table.indexOf('energy') > -1) {
      return `INSERT INTO ${table}(voltage, publicgrid, battery, solar, timestamp) VALUES($1, $2, $3, $4, $5) RETURNING *`
  } else if (table.indexOf('battery') > -1) {
      return `INSERT INTO ${table}(load, timestamp) VALUES($1, $2) RETURNING *`
  } else if (table.indexOf('payments') > -1) {
      return `INSERT INTO ${table}(sender, receiver, transferred_amount, sender_wallet_balance, receiver_wallet_balance, status, start_timestamp, timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`
  } else if (table.indexOf('wallets') > -1) {
      return `INSERT INTO ${table}(owner, address, keyindex, balance, timestamp) VALUES($1, $2, $3, $4, $5) RETURNING *`
  } else if (table.indexOf('localgrid') > -1) {
    return `INSERT INTO ${table}(energy, timestamp) VALUES($1, $2) RETURNING *`
  }
}

const addData = (table, data) => {
  const promise = new Promise((resolve, reject) => {
    try {
      const schema = getTableSchema(table)
      client.query(schema, data, (error, result) => {
        if (error) {
          console.error('addData Postgers', error.stack)
          reject(error.stack)
        } else {
          resolve(result.rows[0])
        }
      })
    } catch (error) {
      console.error('addData catch', error);
      reject(error)
    }
  })
  return promise
}

const queryData = async (table, owner) => {
  const promise = new Promise((resolve, reject) => {
    try {
      client.query(`SELECT * FROM ${table} WHERE owner = '${owner}' ORDER BY keyindex DESC, timestamp DESC LIMIT 1`, [], (error, result) => {
        if (error) {
          console.error('queryData Postgers', error.stack)
          reject(error.stack)
        } else {
          resolve(result.rows[0])
        }
      })
    } catch (error) {
      console.error('queryData catch', error);
      reject(error)
    }
  })
  return promise
}

module.exports = {
  addData,
  queryData,
  connect,
  disconnect
}
