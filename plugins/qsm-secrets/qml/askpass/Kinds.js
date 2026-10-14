.pragma library

// The pane's one per-kind table: a kind of request is a row here and a provider in lib/askpass/.
// tone names a Theme colour; field says whether the person types; allow and deny label the buttons.
var kinds = {
    secret: { title: "Store a secret", icon: "icons/key.svg", tone: "accent", field: true, allow: "Save", deny: "Cancel" },
    sudo: { title: "Authorize sudo", icon: "icons/shield.svg", tone: "warning", field: true, allow: "Allow", deny: "Deny" },
    ssh: { title: "Authorize ssh", icon: "icons/key.svg", tone: "warning", field: true, allow: "Allow", deny: "Deny" },
    git: { title: "Authorize git", icon: "icons/key.svg", tone: "accent", field: true, allow: "Allow", deny: "Deny" },
    notice: { title: "ssh says", icon: "icons/key.svg", tone: "accent", field: false, allow: "OK", deny: "Dismiss" },
    decide: { title: "Allow this action?", icon: "icons/shield.svg", tone: "danger", field: false, allow: "Allow", deny: "Deny" }
}

function has(kind) {
    return Object.prototype.hasOwnProperty.call(kinds, kind)
}
