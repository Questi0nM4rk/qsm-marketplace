pragma Singleton

import QtQuick

// Tokens copied from the running desktop shell's Deep Night theme (qsm-desktop shell/theme/Theme.qml
// and shell/themes/deep-night.json). A copy, not an import: this pane runs without that shell.
// The two derived surfaces are the shell's lift of surface, written as a tint of text over surface.
QtObject {
    readonly property color background: "#1B1027"
    readonly property color surface: "#2E203C"
    readonly property color surfaceRaised: Qt.tint(surface, Qt.rgba(text.r, text.g, text.b, 0.08))
    readonly property color outline: Qt.tint(surface, Qt.rgba(text.r, text.g, text.b, 0.2))
    readonly property color text: "#F6F1FB"
    readonly property color textMuted: "#BCAECA"
    readonly property color accent: "#C7A8EB"
    readonly property color warning: "#E8C58A"
    readonly property color danger: "#FF8B94"
    readonly property color success: "#91D6C2"
    readonly property color shadow: "#000000"

    readonly property string fontFamily: "CaskaydiaCove Nerd Font"
    readonly property string technicalFontFamily: "CaskaydiaCove Nerd Font Mono"
    readonly property int textXs: 10
    readonly property int textSm: 12
    readonly property int textMd: 14
    readonly property int textLg: 18
    readonly property int weightMedium: Font.Medium
    readonly property int weightBold: Font.DemiBold

    readonly property int space1: 4
    readonly property int space2: 8
    readonly property int space3: 12
    readonly property int space4: 16
    readonly property int space5: 24

    readonly property int radiusSm: 8
    readonly property int radiusMd: 12
    readonly property int radiusXl: 20

    readonly property int iconMd: 20
    readonly property int iconLg: 26
    readonly property int controlHeight: 40
    readonly property int paneWidth: 440
}
