import React, { Component } from 'react'
import { View, Text, StyleSheet } from 'react-native'

import GeoLocation from './GeoLocation'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    marginTop: 50
  },
  boldText: {
    fontSize: 30,
    color: 'red'
  }
})

class GeolocationExample extends Component {
  constructor (props) {
    super(props)

    this.state = {
      position: 'unknown',
      error: null,
      count: 0
    }
  }

  async componentDidMount () {
    this.loc = new GeoLocation()
    this.loc.startObserving(
      (position) => this.setState({position: JSON.stringify(position), error: null}),
      (err) => this.setState({
        error: 'ERROR(' + err.code + '): ' + err.message,
        position: 'unknown'
      })
    )
  }

  componentWillUnmount () {
    this.loc.stopObserving()
  }

  render () {
    return (
      <View style={styles.container}>
        <Text style={styles.boldText}>
               Position:
        </Text>
        <Text>
          {this.state.position}
        </Text>
        <Text style={styles.boldText}>
               Error:
        </Text>
        <Text>
          {this.state.error}
        </Text>
      </View>
    )
  }
}

export default GeolocationExample
