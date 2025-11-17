// Get ISO timestamp in future or past, by number of days
// e.g. -30 for 30 days ago, or 1 for tomorrow
function getISOTimestamp (numberOfDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + numberOfDays)
  return date.toISOString()
}

function getISODate (numberOfDays = 0) {
  return getISOTimestamp(numberOfDays).split('T')[0]
}

function timeBetweenTimestamps (minTimestamp, maxTimestamp) {
  const diffInSeconds = Math.floor((new Date(maxTimestamp) - new Date(minTimestamp)) / 1000)

  if (diffInSeconds < 60) {
    return `${diffInSeconds} second${diffInSeconds !== 1 ? 's' : ''}`
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours} hour${hours !== 1 ? 's' : ''}`
  } else {
    const days = Math.floor(diffInSeconds / 86400)
    return `${days} day${days !== 1 ? 's' : ''}`
  }
}

module.exports = {
  getISOTimestamp,
  getISODate,
  timeBetweenTimestamps
}
