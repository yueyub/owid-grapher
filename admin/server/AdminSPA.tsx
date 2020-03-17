import * as React from "react"

import { ServerSettings } from "serverSettings"
import { ClientSettings } from "clientSettings"
import * as fs from "fs-extra"
import * as path from "path"
import urljoin = require("url-join")

// TODO: remove.
function getWebpackUrl(
    assetName: string,
    serverSettings: ServerSettings,
    clientSettings: ClientSettings
) {
    if (clientSettings.ENV === "production") {
        const manifestPath = path.join(
            serverSettings.WEBPACK_OUTPUT_PATH,
            "manifest.json"
        )
        const manifest = JSON.parse(
            fs.readFileSync(manifestPath).toString("utf8")
        )
        return urljoin("/admin/build/", manifest[assetName])
    } else {
        if (assetName.match(/\.js$/)) {
            assetName = `js/${assetName}`
        } else if (assetName.match(/\.css$/)) {
            assetName = `css/${assetName}`
        }

        return urljoin(clientSettings.WEBPACK_DEV_URL, assetName)
    }
}

export function AdminSPA(props: {
    username: string
    isSuperuser: boolean
    clientSettings: ClientSettings
    serverSettings: ServerSettings
}) {
    const { ENV, GITHUB_USERNAME, EXPLORER } = props.clientSettings
    const { serverSettings, clientSettings } = props
    const script = `
        window.App = {}
        App.isEditor = true
        window.admin = new Admin({ username: "${
            props.username
        }", isSuperuser: ${props.isSuperuser.toString()}, settings: ${JSON.stringify(
        { ENV, GITHUB_USERNAME, EXPLORER }
    )}})
        admin.start(document.querySelector("#app"))
`

    return (
        <html lang="en">
            <head>
                <title>owid-admin</title>
                <meta name="description" content="" />
                <link
                    href={getWebpackUrl(
                        "commons.css",
                        serverSettings,
                        clientSettings
                    )}
                    rel="stylesheet"
                    type="text/css"
                />
                <link
                    href={getWebpackUrl(
                        "admin.css",
                        serverSettings,
                        clientSettings
                    )}
                    rel="stylesheet"
                    type="text/css"
                />
            </head>
            <body>
                <div id="app"></div>
                <script
                    src={getWebpackUrl(
                        "commons.js",
                        serverSettings,
                        clientSettings
                    )}
                ></script>
                <script
                    src={getWebpackUrl(
                        "admin.js",
                        serverSettings,
                        clientSettings
                    )}
                ></script>
                <script
                    type="text/javascript"
                    dangerouslySetInnerHTML={{ __html: script }}
                />
                {/* This lets the public frontend know to show edit links and such */}
                <iframe
                    src="https://ourworldindata.org/identifyadmin"
                    style={{ display: "none" }}
                />
            </body>
        </html>
    )
}
