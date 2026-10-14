import QtQuick
import QtQuick.Effects
import QtQuick.Layouts
import "Kinds.js" as Kinds

// The one pane. Everything that differs per kind comes from Kinds.js; the request holds no value.
FocusScope {
    id: pane

    property var request: null
    signal answered(string action, string value)

    readonly property var kind: request === null ? null : Kinds.kinds[request.kind]
    readonly property color tone: kind === null ? Theme.accent : Theme[kind.tone]
    readonly property bool hasField: kind !== null && kind.field
    readonly property bool canAllow: !hasField || field.text.length > 0

    implicitWidth: Theme.paneWidth
    implicitHeight: card.implicitHeight

    function answer(action: string): void {
        const typed = field.text
        field.text = ""
        pane.answered(action, action === "allow" ? typed : "")
    }

    onRequestChanged: {
        field.text = ""
        if (request !== null)
            (Kinds.kinds[request.kind].field ? field : denyButton).forceActiveFocus()
    }

    Keys.onEscapePressed: pane.answer("cancel")

    Rectangle {
        id: card
        anchors.fill: parent
        implicitHeight: column.implicitHeight + Theme.space5 * 2
        radius: Theme.radiusXl
        color: Theme.surface
        border.width: 1
        border.color: Theme.outline

        ColumnLayout {
            id: column
            anchors.fill: parent
            anchors.margins: Theme.space5
            spacing: Theme.space3

            RowLayout {
                spacing: Theme.space3

                Item {
                    Layout.preferredWidth: Theme.iconLg
                    Layout.preferredHeight: Theme.iconLg

                    Image {
                        id: icon
                        anchors.fill: parent
                        source: pane.kind === null ? "" : pane.kind.icon
                        sourceSize: Qt.size(Theme.iconLg * 2, Theme.iconLg * 2)
                        visible: false
                    }
                    MultiEffect {
                        anchors.fill: parent
                        source: icon
                        colorization: 1.0
                        colorizationColor: pane.tone
                    }
                }

                Text {
                    Layout.fillWidth: true
                    text: pane.kind === null ? "" : pane.kind.title
                    color: Theme.text
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.textLg
                    font.weight: Theme.weightBold
                    elide: Text.ElideRight
                }
            }

            Text {
                Layout.fillWidth: true
                visible: text !== ""
                text: pane.request === null ? "" : pane.request.prompt
                color: Theme.text
                font.family: Theme.fontFamily
                font.pixelSize: Theme.textMd
                wrapMode: Text.Wrap
                maximumLineCount: 4
                elide: Text.ElideRight
            }

            Rectangle {
                Layout.fillWidth: true
                visible: subject.text !== ""
                implicitHeight: subject.implicitHeight + Theme.space3 * 2
                radius: Theme.radiusSm
                color: Theme.surfaceRaised

                Text {
                    id: subject
                    anchors.fill: parent
                    anchors.margins: Theme.space3
                    text: pane.request === null ? "" : pane.request.subject
                    color: Theme.text
                    font.family: Theme.technicalFontFamily
                    font.pixelSize: Theme.textSm
                    wrapMode: Text.WrapAnywhere
                    maximumLineCount: 4
                    elide: Text.ElideRight
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.space1

                Text {
                    Layout.fillWidth: true
                    text: "ASKED BY"
                    color: Theme.textMuted
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.textXs
                    font.letterSpacing: 1.2
                }
                Text {
                    Layout.fillWidth: true
                    text: pane.request === null ? "" : pane.request.requestedBy.exe
                    color: Theme.text
                    font.family: Theme.technicalFontFamily
                    font.pixelSize: Theme.textSm
                    elide: Text.ElideMiddle
                }
                Text {
                    Layout.fillWidth: true
                    visible: text !== ""
                    text: pane.request === null || pane.request.requestedBy.sha12 === "" ? "" : "sha256 " + pane.request.requestedBy.sha12
                    color: Theme.textMuted
                    font.family: Theme.technicalFontFamily
                    font.pixelSize: Theme.textSm
                }
                Text {
                    Layout.fillWidth: true
                    visible: text !== ""
                    text: pane.request === null ? "" : pane.request.requestedBy.cmdline
                    color: Theme.textMuted
                    font.family: Theme.technicalFontFamily
                    font.pixelSize: Theme.textSm
                    maximumLineCount: 1
                    elide: Text.ElideRight
                }
            }

            Rectangle {
                Layout.fillWidth: true
                visible: pane.hasField
                implicitHeight: Theme.controlHeight
                radius: Theme.radiusMd
                color: Theme.background
                border.width: field.activeFocus ? 2 : 1
                border.color: field.activeFocus ? pane.tone : Theme.outline

                TextInput {
                    id: field
                    anchors.fill: parent
                    anchors.leftMargin: Theme.space3
                    anchors.rightMargin: Theme.space3
                    verticalAlignment: TextInput.AlignVCenter
                    color: Theme.text
                    selectionColor: pane.tone
                    selectedTextColor: Theme.background
                    font.family: Theme.technicalFontFamily
                    font.pixelSize: Theme.textMd
                    echoMode: pane.request !== null && pane.request.masked ? TextInput.Password : TextInput.Normal
                    clip: true
                    activeFocusOnTab: true
                    Accessible.role: Accessible.EditableText
                    Accessible.name: "Answer"
                    Keys.onReturnPressed: if (pane.canAllow) pane.answer("allow")
                    Keys.onEnterPressed: if (pane.canAllow) pane.answer("allow")
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.space2

                Item { Layout.fillWidth: true }

                Rectangle {
                    id: denyButton
                    implicitWidth: denyLabel.implicitWidth + Theme.space5 * 2
                    implicitHeight: Theme.controlHeight
                    radius: Theme.radiusMd
                    color: denyArea.containsMouse ? Theme.surfaceRaised : "transparent"
                    border.width: activeFocus ? 2 : 1
                    border.color: activeFocus ? pane.tone : Theme.outline
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: pane.kind === null ? "" : pane.kind.deny
                    Keys.onReturnPressed: pane.answer("deny")
                    Keys.onSpacePressed: pane.answer("deny")

                    Text {
                        id: denyLabel
                        anchors.centerIn: parent
                        text: pane.kind === null ? "" : pane.kind.deny
                        color: Theme.text
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.textMd
                        font.weight: Theme.weightMedium
                    }
                    MouseArea {
                        id: denyArea
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: pane.answer(pane.kind !== null && pane.kind.field ? "cancel" : "deny")
                    }
                }

                Rectangle {
                    id: allowButton
                    implicitWidth: allowLabel.implicitWidth + Theme.space5 * 2
                    implicitHeight: Theme.controlHeight
                    radius: Theme.radiusMd
                    color: pane.tone
                    opacity: pane.canAllow ? 1 : 0.35
                    border.width: activeFocus ? 2 : 0
                    border.color: Theme.text
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: pane.kind === null ? "" : pane.kind.allow
                    Keys.onReturnPressed: if (pane.canAllow) pane.answer("allow")
                    Keys.onSpacePressed: if (pane.canAllow) pane.answer("allow")

                    Text {
                        id: allowLabel
                        anchors.centerIn: parent
                        text: pane.kind === null ? "" : pane.kind.allow
                        color: Theme.background
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.textMd
                        font.weight: Theme.weightBold
                    }
                    MouseArea {
                        anchors.fill: parent
                        enabled: pane.canAllow
                        onClicked: pane.answer("allow")
                    }
                }
            }
        }
    }
}
