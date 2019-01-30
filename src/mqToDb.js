const { addMessage, extractMessage } = require('./mq')
const { addData, connect } = require('./postgres')
const { getCurrentIotaPrice, calculateEnergyCostInIota } = require('./helpers')
const { mq: { paymentQueue, queue } } = require('../config.json')

const maxTransactionsToCollect = 7200 // every 40 minutes = 2400 seconds. Every second we read 3 events
let counter = 0
const cellID = 1

const payments = {
  localGridToSolar: 0,
  localGridToBattery: 0,
  localGridToPublicGrid: 0,
  localGridToRobot: 0,
}

let localGridPower = {}

const mqToDB = async () => {
  try {
    await extractMessage(`${queue}${cellID}`)
      .then(async json => {
        if (json.ENERGY && json.ENERGY.RobotName) {
          // process robot data
          const struc = json.ENERGY.Energy_Measuring.ENERGY_MEASURING_STRUC;
          const robotJSON = {
            power: Number(json.ENERGY.Act_Power),
            energy: Number(struc.ENERGY), // struc.ACTIVE === 'TRUE' ? (data.energy + Number(struc.ENERGY)) : Number(struc.ENERGY)
            time: Number(struc.TIME),
            timestamp: json.ENERGY.TimeStamp2,
            timestamp1: json.ENERGY.TimeStamp,
          }

          payments.localGridToRobot += Number(json.ENERGY.Act_Power)
          localGridPower.robot = Number(json.ENERGY.Act_Power)

          if (robotJSON) {
            await addData(`robot_${cellID}`, Object.values(robotJSON))
          }
        } else if (json.ZKL_BAT_1_ACC) {
          // process battery flow data
          const batteryJSON = {
            load: Number(json.ZKL_BAT_1_ACC),
            timestamp: json.Timestamp,
          }
          if (batteryJSON) {
            await addData(`battery_${cellID}`, Object.values(batteryJSON))
          }
        } else if (json.SPG_GRID) {
          // process energy flow data
          const energyJSON = {
            voltage: Number(json.SPG_GRID),
            publicgrid: Number(json.ZKL_ALM),
            battery: Number(json.ZKL_BAT),
            solar: Number(json.ZKL_PV),
            timestamp: json.Timestamp,
          }

          // "+" Energy is flowing INTO the local DC grid
          // "-" Energy is flowing OUT of the local DC GRID
          payments.localGridToSolar += Number(json.ZKL_PV)
          payments.localGridToBattery += Number(json.ZKL_BAT)
          payments.localGridToPublicGrid += Number(json.ZKL_ALM)

          localGridPower.others = Math.round((Number(json.ZKL_PV) + Number(json.ZKL_BAT) + Number(json.ZKL_ALM)) * 100) / 100
          localGridPower.timestamp = json.Timestamp

          if (energyJSON) {
            await addData(`energy_${cellID}`, Object.values(energyJSON))
          }
        }

        if (localGridPower.robot && localGridPower.others) {
          // Calculate and store energy provided by local DC grid
          await addData(`localgrid_${cellID}`, [localGridPower.robot - localGridPower.others, localGridPower.timestamp])

          // Reset values
          localGridPower = {}
        }

        if (++counter >= maxTransactionsToCollect) {
          // add payment to queue
          await preparePaymentQueue()

          // reset counter
          counter = 0

          // reset wallet values
          payments.localGridToSolar = 0
          payments.localGridToBattery = 0
          payments.localGridToPublicGrid = 0
          payments.localGridToRobot = 0
        }
      })
      .catch(error => {
        console.error(error)
      })
  } catch (error) {
    console.error('mqToDB catch', error);
  }
};

const getQueue = () => `${paymentQueue}${cellID}`

const preparePaymentQueue = async () => {
  // get current price of 1 MIOTA
  const iotaPrice = await getCurrentIotaPrice()

  if (payments.localGridToSolar > 0) {
    const energyCost = calculateEnergyCostInIota(payments.localGridToSolar, iotaPrice)
    if (energyCost !== 0) addMessage(['localGrid', 'solar', energyCost], getQueue())
  }

  if (payments.localGridToBattery > 0) {
    const energyCost = calculateEnergyCostInIota(payments.localGridToBattery, iotaPrice)
    if (energyCost !== 0) addMessage(['localGrid', 'battery', energyCost], getQueue())
  } else if (payments.localGridToBattery < 0) {
    const energyCost = calculateEnergyCostInIota(Math.abs(payments.localGridToBattery), iotaPrice)
    if (energyCost !== 0) addMessage(['battery', 'localGrid', energyCost], getQueue())
  }

  if (payments.localGridToPublicGrid > 0) {
    const energyCost = calculateEnergyCostInIota(payments.localGridToPublicGrid, iotaPrice)
    if (energyCost !== 0) addMessage(['localGrid', 'publicGrid', energyCost], getQueue())
  } else if (payments.localGridToPublicGrid < 0) {
    const energyCost = calculateEnergyCostInIota(Math.abs(payments.localGridToPublicGrid), iotaPrice)
    if (energyCost !== 0) addMessage(['publicGrid', 'localGrid', energyCost], getQueue())
  }

  if (payments.localGridToRobot > 0) {
    const energyCost = calculateEnergyCostInIota(payments.localGridToRobot, iotaPrice)
    if (energyCost !== 0) addMessage(['robot', 'localGrid', energyCost], getQueue())
  } else if (payments.localGridToRobot < 0) {
    const energyCost = calculateEnergyCostInIota(Math.abs(payments.localGridToRobot), iotaPrice)
    if (energyCost !== 0) addMessage(['localGrid', 'robot', energyCost], getQueue())
  }
}

connect()
setInterval(mqToDB, 333);
