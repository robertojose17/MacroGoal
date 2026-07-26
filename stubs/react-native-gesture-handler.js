/* eslint-disable react/prop-types */
'use strict';
var React = require('react');
var RN = require('react-native');
var View = RN.View;
var ScrollView = RN.ScrollView;
var FlatList = RN.FlatList;
var TouchableOpacity = RN.TouchableOpacity;

function GestureHandlerRootView(props) {
  return React.createElement(View, { style: props.style }, props.children);
}
function Swipeable(props) {
  return React.createElement(View, { style: props.containerStyle }, props.children);
}
function PanGestureHandler(props) {
  return React.createElement(View, null, props.children);
}
function TapGestureHandler(props) {
  return React.createElement(View, null, props.children);
}
function GestureDetector(props) {
  return React.createElement(View, null, props.children);
}
function PinchGestureHandler(props) {
  return React.createElement(View, null, props.children);
}

module.exports = {
  default: {},
  GestureHandlerRootView: GestureHandlerRootView,
  Swipeable: Swipeable,
  PanGestureHandler: PanGestureHandler,
  TapGestureHandler: TapGestureHandler,
  GestureDetector: GestureDetector,
  PinchGestureHandler: PinchGestureHandler,
  Gesture: {
    Pan: function() { return {}; },
    Tap: function() { return {}; },
    Simultaneous: function() { return {}; },
    Race: function() { return {}; },
    Exclusive: function() { return {}; },
  },
  ScrollView: ScrollView,
  FlatList: FlatList,
  TouchableOpacity: TouchableOpacity,
  State: {
    UNDETERMINED: 0,
    FAILED: 1,
    BEGAN: 2,
    CANCELLED: 3,
    ACTIVE: 4,
    END: 5,
  },
  Directions: {
    RIGHT: 1,
    LEFT: 2,
    UP: 4,
    DOWN: 8,
  },
};
