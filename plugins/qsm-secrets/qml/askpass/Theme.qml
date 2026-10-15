pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// The colours are the qsm palette: colors.json beside this file holds the defaults, and the person's
// own file, whose path the binary passes as QSM_COLORS, overrides any key it sets. The pane rereads
// that file when it changes. A key missing or not a #RRGGBB or #AARRGGBB colour keeps its default.
QtObject {
    id: theme

    property var chosen: ({})
    readonly property var defaults: JSON.parse(shipped.text())

    property FileView shipped: FileView {
        path: Qt.resolvedUrl("colors.json").toString().replace(/^file:\/\//, "")
        blockLoading: true
    }

    property FileView own: FileView {
        path: Quickshell.env("QSM_COLORS") ?? ""
        blockLoading: true
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: theme.chosen = theme.parse(text())
        onLoadFailed: theme.chosen = ({})
    }

    function parse(text: string): var {
        try {
            const value = JSON.parse(text)
            if (value !== null && typeof value === "object")
                return value
        } catch (e) {
        }
        console.warn(`qsm palette: ${own.path} is not a JSON object; the defaults apply`)
        return {}
    }

    function pick(key: string): color {
        const value = chosen[key]
        return typeof value === "string" && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : defaults[key]
    }

    readonly property color background: pick("background")
    readonly property color surface: pick("surface")
    readonly property color surfaceRaised: Qt.tint(surface, Qt.rgba(text.r, text.g, text.b, 0.08))
    readonly property color outline: Qt.tint(surface, Qt.rgba(text.r, text.g, text.b, 0.2))
    readonly property color text: pick("text")
    readonly property color textMuted: pick("textMuted")
    readonly property color accent: pick("accent")
    readonly property color warning: pick("warning")
    readonly property color danger: pick("danger")
    readonly property color success: pick("success")
    readonly property color shadow: pick("shadow")

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
