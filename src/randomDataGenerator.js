const https = require('https')
const format = require ('date-fns/format')
const getHours = require('date-fns/get_hours')
const { mq: { apiBase, queue, qMgr }, messageRobot } = require('../config.json')
const { mq: { username, password, hostname, port } } = require('../credentials.json')

const cellID = 1

const path = `${apiBase}messaging/qmgr/${qMgr}/queue/${`${queue}${cellID}`}/message`
const url = `https://${hostname}:${port}${path}`

const options = {
  hostname,
  port,
  path,

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

const addMessage = message => {
  options.method = 'POST'
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

const getRandomInt = max => Math.floor(Math.random() * Math.floor(max))
const getRandomSign = () => getRandomInt(100) % 2 > 0 ? 1 : -1

const changeByPercentage = (previousValue, percentage = 5, defaultValue = getRandomInt(10) * Math.random()) => {
  const value = previousValue > 0.01 ? previousValue : defaultValue
  const percent = (value * percentage * Math.random() / 100) || defaultValue
  // change the previous value by max 5% with randon sign
  return getRandomSign() * percent + value
}

const getValueByDayTime = (previousValue, timestamp) => {
  const hours = getHours(timestamp)
  if (hours < 8 || hours > 17) {
    // not enough light
    return 0
  }

  if (hours === 8 || hours === 17) {
    // graceful degradation
    return Math.abs(changeByPercentage((previousValue * 0.75) || Math.random()))
  }

  return Math.abs(changeByPercentage(previousValue))
}

let batteryLoad = 1 + getRandomInt(100)
let robotPower = getRandomInt(1000) + Math.random()
let robotEnergy = getRandomInt(50) + Math.random()
let gridPower = getRandomInt(1000)
let grid = 50 + Math.random()
let battery = 30 + Math.random()
let solar = getValueByDayTime(10 * Math.random(), Date.now())

const addData = () => {
  const timestamp = Date.now()
  const formattedTimestamp = format(timestamp, 'YYYY-MM-DDTHH:mm:ss')
  const message1 = {}
  const message2 = {}

  batteryLoad = changeByPercentage(100, 5, 10)
  robotPower = changeByPercentage(robotPower, 5, 100)
  robotEnergy = changeByPercentage(robotEnergy, 5, 20)
  gridPower = changeByPercentage(gridPower, 5, 500)
  grid = changeByPercentage(grid)
  battery = changeByPercentage(battery)
  solar = getValueByDayTime(solar, timestamp)

  message1.Timestamp = formattedTimestamp
  message1.ZKL_BAT_1_ACC = `+${batteryLoad.toFixed(2)}`

  message2.Timestamp = formattedTimestamp
  message2.SPG_GRID = `+${gridPower.toFixed(2)}`,
  message2.ZKL_ALM = `${grid.toFixed(2)}`,
  message2.ZKL_BAT = `${battery.toFixed(2)}`,
  message2.ZKL_PV = `${solar.toFixed(2)}`,

  messageRobot.ENERGY.TimeStamp = timestamp
  messageRobot.ENERGY.TimeStamp2 = formattedTimestamp
  messageRobot.ENERGY.Act_Power = `${robotPower.toFixed(2)}`
  messageRobot.ENERGY.Energy_Measuring.ENERGY_MEASURING_STRUC.ENERGY = `${robotEnergy.toFixed(2)}`

  // console.log(message1);
  // console.log('==============');
  // console.log(message2);
  // console.log('==============');
  // console.log(messageRobot);
  // console.log('================================================');

  addMessage(message1)
  addMessage(message2)
  addMessage(messageRobot)
}

setInterval(addData, 1000);
