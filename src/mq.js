const https = require('https')
const util = require('util')
const { mq: { queue, qMgr } } = require('../config.json')
const { mq: { username, password, hostname, port } } = require('../credentials.json')

const apiBase = '/ibmmq/rest/v1/' // All the admin REST calls start from this point

const options = {
  hostname,
  port,

  // For test purposes, permit the qmgr to use a self-signed cert.
  // Would want to point to a real keystore for secure production
  rejectUnauthorized: false,

  headers: {
    'Content-Type': 'text/plain',

    // Use basic authentication - pass userid/password on every request
    // Could use alternatives with the LTPA token after a call to the /login API
    'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),

    // Need this header for POST operations even if it has no content
    'ibm-mq-rest-csrf-token' : ''
  }
}

const addMessage = (message, q = queue) => {
  options.method = 'POST'
  options.path = `${apiBase}messaging/qmgr/${qMgr}/queue/${q}/message`
  const request = https.request(options, response => {
    if (response.statusCode !== 201) {
      console.log('addMessage statusCode:', response.statusCode)
    }
  })

  request.on('error', error => {
    console.error('addMessage error:' + error)
  })

  request.write(typeof message === 'string' ? message : JSON.stringify(message))
  request.end()
}

const extractMessage = (q = queue) => {
  const promise = new Promise((resolve, reject) => {
    options.path = `${apiBase}messaging/qmgr/${qMgr}/queue/${q}/message`
    options.method = 'DELETE'
    const request = https.request(options, response => {
      if (response.statusCode < 200 || response.statusCode > 299) {
        const errMsg = util.format('extractMessage failed.\nStatusCode: %d\nStatusMessage:', response.statusCode, response.statusMessage)
        console.log(errMsg);
        reject(errMsg)
      }

      response.setEncoding('utf8')
      response.on('data', message => {
        resolve(JSON.parse(message))
      })
    })

    request.on('error', error => {
      reject(error)
    })

    request.end()
  });
  return promise
}

module.exports = {
  addMessage,
  extractMessage
}

// for (var index = 0; index < 10; index++) {
//   extractMessage('DEV.QUEUE.DATA.CELL2')
// }
