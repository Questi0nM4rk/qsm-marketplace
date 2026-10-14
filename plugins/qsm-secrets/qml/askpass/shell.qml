import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import "Kinds.js" as Kinds

// The askpass pane: one overlay window that shows the first queued request and writes the person's
// answer, as one JSON line, to the reply socket the request names. It holds no secret: the request
// carries none, and the typed text leaves through the socket.
ShellRoot {
    id: root

    property var queue: []
    readonly property var current: queue.length > 0 ? queue[0] : null

    // Each request has its own clock, so the next one in the queue starts afresh.
    onCurrentChanged: if (current !== null) timer.restart()

    // The reply goes only to the one place the binary makes it: no argv can point the pane's answer
    // at a socket of another process's choosing.
    readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR") ?? ""

    function validRequest(request: var): bool {
        return request !== null && typeof request === "object"
            && Kinds.has(request.kind)
            && typeof request.nonce === "string" && /^[0-9a-f]{32}$/.test(request.nonce)
            && root.runtimeDir !== ""
            && request.socketPath === root.runtimeDir + "/qsm-askpass/" + request.nonce + "/reply.sock"
            && typeof request.prompt === "string" && typeof request.subject === "string"
            && typeof request.requestedBy === "object" && request.requestedBy !== null
    }

    function remove(nonce: string): void {
        root.queue = root.queue.filter(request => request.nonce !== nonce)
    }

    function answer(action: string, value: string): void {
        const request = root.current
        if (request === null)
            return
        remove(request.nonce)
        replyComponent.createObject(root, {
            path: request.socketPath,
            line: JSON.stringify({ nonce: request.nonce, action: action, value: value }) + "\n"
        })
    }

    IpcHandler {
        target: "askpass"

        function request(request: string): string {
            let parsed = null
            try {
                parsed = JSON.parse(request)
            } catch (e) {
                return "invalid"
            }
            if (!root.validRequest(parsed))
                return "invalid"
            root.queue = root.queue.concat([parsed])
            return "queued"
        }

        function withdraw(nonce: string): void {
            root.remove(nonce)
        }
    }

    Component {
        id: replyComponent

        Socket {
            id: reply
            property string line: ""
            connected: true
            onConnectedChanged: {
                if (!connected)
                    return
                write(line)
                flush()
                Qt.callLater(() => {
                    reply.connected = false
                    reply.destroy()
                })
            }
            onError: reply.destroy()
        }
    }

    // The request's own clock: the binary stops waiting at the same time.
    Timer {
        id: timer
        interval: root.current === null ? 1000 : Math.max(1000, root.current.timeoutMs)
        running: root.current !== null
        repeat: false
        onTriggered: if (root.current !== null) root.remove(root.current.nonce)
    }

    PanelWindow {
        screen: Quickshell.screens.find(s => s.name === Hyprland.focusedMonitor?.name) ?? Quickshell.screens[0]
        visible: root.current !== null
        color: "transparent"
        implicitWidth: pane.implicitWidth
        implicitHeight: pane.implicitHeight
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "qsm-askpass"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

        AskPane {
            id: pane
            anchors.fill: parent
            focus: true
            request: root.current
            onAnswered: (action, value) => root.answer(action, value)
        }
    }
}
