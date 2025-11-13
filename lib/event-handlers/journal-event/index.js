const dockedEvent = require('./docked-event')
const fsdjumpEvent = require('./fsdjump-event')
const locationEvent = require('./location-event')

module.exports = (payload) => {
  const eventName = payload.message.event.toLowerCase()

  switch (eventName) {
    case 'docked':
      dockedEvent(payload)
      break
    case 'fsdjump':
      fsdjumpEvent(payload)
      break
    case 'location':
      locationEvent(payload)
      break
    default:
  }
}
