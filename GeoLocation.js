import { PermissionsAndroid } from 'react-native'
import GPSState from 'react-native-gps-state'

// Timeout waiting for a GPS position
const TIMEOUT = 10 * 60 * 1000 // 10 minutes
// Keep polling GPS until we get accuracy below this
const MAX_ACCURACY = 10 // meters
// The max age of any cached position
const MAX_AGE = 5 * 60 * 1000 // 5 minutes
// Minimum distance moved before location updates
const MIN_DISTANCE = 10 // meters

const errorCodes = {
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
  UNKNOWN: 4
}

const errorMessages = {
  PERMISSION_DENIED: 'Location permission denied by user',
  POSITION_UNAVAILABLE: 'Location services are turned off',
  TIMEOUT: 'Location serach timed out',
  UNKNOWN: 'Unknown error'
}

const statusCodes = {
  SEARCHING: 1,
  LOW_ACCURACY: 2,
  HIGH_ACCURACY: 3
}

/**
 * Create a new geolocation instance
 *
 * @example
 * const loc = new GeoLocation()
 *
 * @param {Object} options [not yet implemented]
 * @class GeoLocation
 */
class GeoLocation {
  constructor (options) {
    this.started = false
  }


  /**
   * Request permissions and start observing the location.
   *
   * `Position.status` is an `unsigned short` representing the status:
   *
   * | Value | Associated Constant | Description |
   * | ----- | ------------------- | ------------|
   * | `1`   | `GeoLocation.SEARCHING` | GPS is searching for a location fix |
   * | `2`   | `GeoLocation.LOW_ACCURACY` | Low accuracy position, continuing to search for better accuracy |
   * | `3`   | `GeoLocation.HIGH_ACCURACY` | High accuracy position, will only update if use moves |
   *
   * `PositionError.code` is an `unsigned short` representing the error:
   *
   * | Value | Associated Constant | Description |
   * | ----- | ------------------- | ------------|
   * | `1`   | `GeoLocation.PERMISSION_DENIED` | Location acquisition failed because the app does not have permission |
   * | `2`   | `GeoLocation.POSITION_UNAVAILABLE` | Location acquisition failed because location services are turned off or unavailable |
   * | `3`   | `GeoLocation.TIMEOUT` | Timeout was reached before a location was found |
   * | `4`   | `GeoLocation.UNKNOWN` | Unknown error occured trying to acquire location |
   *
   * @param {function} onLocation Called with every location update, *including*
   * when searching for a location, but no position is available. Returns a
   * [Position](https://developer.mozilla.org/en-US/docs/Web/API/Position)
   * object with an additional property `status` (see above)
   * @param {function} onError Called every time there is an error (failed to
   * get position) with a
   * [PositionError](https://developer.mozilla.org/en-US/docs/Web/API/PositionError)
   * object with an additional `PositionError.code` (see above)
   * @memberof GeoLocation
   */
  async startObserving (onLocation, onError) {
    if (this.started) throw Error('Called startObserving more than once')

    // Request permissions
    try {
      await requestLocationPermission()
    } catch (err) {
      return onError(err)
    }

    this.started = true
    onUpdate()

    // Watch for changes in GPS state - detect if the user turns off location
    GPSState.addListener((status) => {
      // If location is turned back on, get an initial position quickly,
      // the watch will continue running
      if (status === GPSState.AUTHORIZED) {
        getInitialPosition(onUpdate, onError)
        onUpdate()
      }
      // This module reports RESTRICTED status when the user turns off location
      if (status !== GPSState.RESTRICTED) return
      const err = createError(
        errorMessages.POSITION_UNAVAILABLE,
        errorCodes.POSITION_UNAVAILABLE
      )
      onError(err)
    })

    // Get an initial low accuracy location
    getInitialPosition(onUpdate, onError)

    // At the same time start search for high accuracy location
    this.watchId = watchPositionUntilAccurate(
      (position) => {
        // Keep searching for location until accuracy is better
        if (position.coords.accuracy <= MAX_ACCURACY) {
          navigator.geolocation.clearWatch(this.watchId)
          // Only update the location if the user moves
          this.watchId = watchPositionForMovement(onUpdate, onError)
        }
        onUpdate(position)
      },
      onError
    )

    function onUpdate (position) {
      if (!position) {
        position = { status: statusCodes.SEARCHING }
      } else if (position.coords.accuracy > MAX_ACCURACY) {
        position.status = statusCodes.LOW_ACCURACY
      } else {
        position.status = statusCodes.HIGH_ACCURACY
      }
      onLocation(position)
    }
  }

  /**
   * Stop observing the location
   *
   * @memberof GeoLocation
   */
  stopObserving () {
    if (typeof this.watchId === 'undefined') return
    navigator.geolocation.clearWatch(this.watchId)
    GPSState.removeListener()
  }
}

Object.assign(GeoLocation, statusCodes, errorCodes)

export default GeoLocation

/**
 * Gets a location without highAccuracy (which include position from cell phone
 * towers and wifi). It will use a previously cached position if it is less than
 * MAX_AGE milliseconds old
 * @private
**/
function getInitialPosition (success, error) {
  navigator.geolocation.getCurrentPosition(success, error, {
    enableHighAccuracy: false,
    timeout: TIMEOUT,
    maximumAge: MAX_AGE
  })
}

/**
 * Starts watching the location (updates every 1000ms on most phones)
 * @private
 */
function watchPositionUntilAccurate (success, error) {
  return navigator.geolocation.watchPosition(success, error, {
    enableHighAccuracy: true,
    timeout: TIMEOUT,
    maximumAge: 0,
    distanceFilter: 0
  })
}

/**
 * Once we have an accurate location we can stop updating every 1000ms and
 * instead set a distanceFilter to only update the location when the user moves
 * @private
 */
function watchPositionForMovement (success, error) {
  return navigator.geolocation.watchPosition(success, error, {
    enableHighAccuracy: true,
    timeout: TIMEOUT,
    maximumAge: 0,
    distanceFilter: MIN_DISTANCE
  })
}

/**
 * Request permission to access location. Throws an error if permission is denied
 * @private
 */
async function requestLocationPermission () {
  let granted
  try {
    granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
    ])
    console.log('granted', granted)
  } catch (err) {
    console.log('error', err)
    throw createError(err.message, errorCodes.UNKNOWN)
  }
  if (granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] !== 'granted') {
    console.log('granted', granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION])
    throw createError(errorMessages.PERMISSION_DENIED, errorCodes.PERMISSION_DENIED)
  }
}

function createError (msg, errorCode) {
  const err = new Error(msg)
  err.code = errorCode
  return err
}
