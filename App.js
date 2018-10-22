// @flow

import React from 'react';
import {
  StyleSheet,
  Image,
  View,
  PanResponder,
  Dimensions,
  Modal,
  Alert,
  Vibration,
  Text,
} from 'react-native';
import uniq from 'lodash/uniq';
import { Gyroscope } from 'expo';
import styled from 'styled-components';
import {
  backgroundImage,
  slenderMan,
  characterUp,
  characterDown,
  characterLeft,
  characterRight,
} from 'dojo-halloween/assets/';
import { KeysIndicator, Items, Sound, Minimap } from 'dojo-halloween/src/components';
import { itemsCount, treasuresCount } from 'dojo-halloween/src/helpers/constants';
import {
  generateRandomCoordinates,
  doPointsCollide,
  getSquareDistance,
} from 'dojo-halloween/src/helpers/itemsHelper';

const backgroundDimensions: { width: number, height: number } = Image.resolveAssetSource(
  backgroundImage
);

const background = { x: backgroundDimensions.width, y: backgroundDimensions.height };

const screenDimensions: { width: number, height: number } = Dimensions.get('screen');

const screen = { x: screenDimensions.width, y: screenDimensions.height };

const characterDirections: {| up: Image, down: Image, left: Image, right: Image |} = {
  up: characterUp,
  down: characterDown,
  left: characterLeft,
  right: characterRight,
};

export default class App extends React.Component<*, StateType> {
  initialState = {
    gyroscopeData: { x: 0, y: 0, z: 0 },
    characterDirection: 'down',
    showSlenderManModal: false,
    keysNumber: 0,
    openedItemsKeys: [],
    isFinalChestVisible: false,
    isInDanger: false,
    collidingElement: null,
    showTreasureIndication: false,
    initial: {
      x: 0,
      y: 0,
    },
    delta: {
      x: 0,
      y: 0,
    },
    start: {
      x: 0,
      y: 0,
    },
  };

  state: StateType = this.initialState;

  subscription: EmitterSubscription<*>;

  itemsList = generateRandomCoordinates(background.x, background.y);

  resetGame = () => {
    this.itemsList = generateRandomCoordinates(background.x, background.y);
    this.setState({ ...this.initialState });
  };

  componentDidMount() {
    Sound.init();
    this.subscription = Gyroscope.addListener((result: { x: number, y: number, z: number }) => {
      this.setState({ gyroscopeData: result });
    });
  }

  componentWillUnmount() {
    this.subscription && this.subscription.remove();
  }

  handleKeysIndicator = (prevState: StateType, collidingTreasure: ?Point<number>) => {
    if (
      !prevState.showTreasureIndication &&
      collidingTreasure &&
      (collidingTreasure.type === 'good' || this.state.isFinalChestVisible) &&
      !this.state.openedItemsKeys.includes(collidingTreasure.key)
    ) {
      this.setState({ showTreasureIndication: true });
    }
    if (prevState.keysNumber !== this.state.keysNumber) {
      this.setState({ showTreasureIndication: false });
    }
  };

  handleCollision = (prevState: StateType, collidingElement: ?Point<number>) => {
    // Set inDanger flag when entering danger zone
    if (!prevState.collidingElement && collidingElement) {
      Vibration.vibrate(500);
      this.setState({ collidingElement, isInDanger: true });
    }
    // Reset when exiting danger zone
    if (prevState.collidingElement && !collidingElement) {
      this.setState({ collidingElement: null });
    }
  };

  handleSlenderManModal = (
    prevState: StateType,
    collidingElement: ?Point<number>,
    charItem: { key: string, x: number, y: number, type: string }
  ) => {
    if (
      !this.state.showSlenderManModal &&
      this.state.isInDanger &&
      collidingElement &&
      getSquareDistance(collidingElement, charItem) < 10000
    ) {
      Sound.playScream();
      this.setState({ showSlenderManModal: true });
    }
    // Auto hide slenderManModal
    if (!prevState.showSlenderManModal && this.state.showSlenderManModal) {
      setTimeout(() => this.setState({ showSlenderManModal: false, isInDanger: false }), 1500);
    }
  };

  handleBoxOpening = (prevState: StateType, collidingTreasure: ?Point<number>) => {
    if (
      collidingTreasure &&
      collidingTreasure.key &&
      prevState.gyroscopeData.y <= 7 &&
      this.state.gyroscopeData.y > 7
    ) {
      const openedItems: Array<string> = uniq([
        ...this.state.openedItemsKeys,
        collidingTreasure.key,
      ]);
      this.setState({
        keysNumber: this.state.keysNumber + 1,
        openedItemsKeys: openedItems,
        isFinalChestVisible: openedItems.length >= treasuresCount,
      });
      collidingTreasure.type === 'treasure'
        ? Alert.alert('Félicitations', 'Tu as trouvé le dernier trésor!', [
            { text: 'Super!', onPress: () => {} },
            { text: 'Rejouer?', onPress: this.resetGame },
          ])
        : Alert.alert('Bravo', 'Coffre ouvert');
    }
  };

  componentDidUpdate(_: any, prevState: StateType) {
    const charItem = {
      key: String(itemsCount),
      x: background.x / 2 - this.state.initial.x - this.state.delta.x - 30,
      y: background.y / 2 - this.state.initial.y - this.state.delta.y - 30,
      type: 'character',
    };
    const collidingElement = this.itemsList.find(
      (element: Point<number>) => element.type === 'bad' && doPointsCollide(element, charItem)
    );
    const collidingTreasure = this.itemsList.find(
      (element: Point<number>) =>
        ['good', 'treasure'].includes(element.type) && doPointsCollide(element, charItem)
    );
    this.handleKeysIndicator(prevState, collidingTreasure);
    this.handleCollision(prevState, collidingElement);
    this.handleSlenderManModal(prevState, collidingElement, charItem);
    this.handleBoxOpening(prevState, collidingTreasure);
  }

  onImageLayout = (event: ViewLayoutEvent) => {
    const { x, y } = event.nativeEvent.layout;
    if (!this.state.start.x || !this.state.start.y) this.setState({ start: { x, y } });
  };

  getFinalDisplacement = (diff: number, dimension: string) => {
    return diff > 0
      ? Math.min(diff, -this.state.start[dimension] - this.state.initial[dimension])
      : Math.max(
          diff,
          screen[dimension] -
            background[dimension] -
            this.state.start[dimension] -
            this.state.initial[dimension]
        );
  };

  handleGesture = (_: any, gestureState: { dx: number, dy: number }) => {
    const finalDx = this.getFinalDisplacement(gestureState.dx, 'x');
    const finalDy = this.getFinalDisplacement(gestureState.dy, 'y');
    let characterDirection = this.state.characterDirection;
    if (Math.abs(finalDx) > Math.abs(finalDy)) {
      characterDirection = finalDx < 0 ? 'right' : 'left';
    } else {
      characterDirection = finalDy < 0 ? 'down' : 'up';
    }
    this.setState({ delta: { x: finalDx, y: finalDy }, characterDirection });
  };

  resetDragState = () => {
    const { initial, delta } = this.state;
    this.setState({
      initial: { x: initial.x + delta.x, y: initial.y + delta.y },
      delta: { x: 0, y: 0 },
    });
  };

  panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: this.handleGesture,
    onPanResponderRelease: this.resetDragState,
  });

  render() {
    const { initial, delta } = this.state;
    const imageStyle = {
      left: initial.x + delta.x,
      top: initial.y + delta.y,
    };
    const itemContainerStyle = {
      position: 'absolute',
      left: this.state.start.x + initial.x + delta.x,
      top: this.state.start.y + initial.y + delta.y,
      height: background.y,
      width: background.x,
    };
    return (
      <View style={styles.container}>
        <Image
          onLayout={this.onImageLayout}
          source={backgroundImage}
          style={imageStyle}
          {...this.panResponder.panHandlers}
        />
        <View style={itemContainerStyle} pointerEvents={'box-none'}>
          <Items
            isFinalChestVisible={this.state.isFinalChestVisible}
            foundTreasures={this.state.openedItemsKeys}
            itemsList={this.itemsList}
          />
        </View>
        <Image
          style={{ position: 'absolute' }}
          source={characterDirections[this.state.characterDirection]}
        />
        <Minimap
          background={background}
          screen={screen}
          itemsList={this.itemsList}
          isFinalChestVisible={this.state.isFinalChestVisible}
          startDimension={this.state.start}
          initialDimension={this.state.initial}
          deltaDimension={this.state.delta}
        />
        <KeysIndicator keysNumber={this.state.keysNumber} />
        {this.state.showTreasureIndication && (
          <View pointerEvents="box-none" style={styles.treasureTextView}>
            <Text style={styles.treasureText}>Ouvre le coffre!</Text>
          </View>
        )}
        <Modal
          transparent
          animationType={'fade'}
          visible={this.state.showSlenderManModal}
          onRequestClose={() => {}}
        >
          <View style={styles.fullScreenStyle}>
            <Image source={slenderMan} resizeMode={'contain'} />
          </View>
        </Modal>
      </View>
    );
  }
}

type StateType = {
  gyroscopeData: {
    x: number,
    y: number,
    z: number,
  },
  keysNumber: number,
  openedItemsKeys: Array<string>,
  characterDirection: 'up' | 'down' | 'left' | 'right',
  showSlenderManModal: boolean,
  showTreasureIndication: boolean,
  isFinalChestVisible: boolean,
  isInDanger: boolean,
  collidingElement: ?Point<number>,
  initial: {
    x: number,
    y: number,
  },
  delta: {
    x: number,
    y: number,
  },
  start: {
    x: number,
    y: number,
  },
};

const styles: { [key: string]: Object } = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenStyle: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    position: 'absolute',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(93,93,93,0.5)',
  },
  treasureTextView: {
    flex: 1,
    position: 'absolute',
    bottom: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignSelf: 'center',
  },
  treasureText: {
    padding: 32,
    flex: 1,
    color: 'white',
  },
});
