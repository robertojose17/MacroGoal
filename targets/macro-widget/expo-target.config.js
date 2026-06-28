/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "MacroWidget",
  displayName: "Macro Goal",
  deploymentTarget: "16.0",
  bundleIdentifier: ".macrowidget",
  frameworks: ["SwiftUI", "WidgetKit"],
  entitlements: {
    "com.apple.security.application-groups": ["group.com.robertojose17.macrogoal"],
  },
  colors: {
    $accent: { color: "#00E5FF", darkColor: "#00E5FF" },
    $widgetBackground: { color: "#1A1A1A", darkColor: "#1A1A1A" },
  },
};
