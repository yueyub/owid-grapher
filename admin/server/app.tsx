import * as express from "express"
require("express-async-errors")
const cookieParser = require("cookie-parser")
const expressErrorSlack = require("express-error-slack")
import "reflect-metadata"
import { AdminSPA } from "./AdminSPA"
import { authMiddleware } from "./authentication"
import { api, publicApi } from "./api"
import { makeTestPagesRouter } from "./testPages"
import { makeAdminRouter } from "./adminViews"
import { renderToHtmlPage } from "utils/server/serverUtil"
import { ServerSettings } from "serverSettings"
import { ClientSettings } from "clientSettings"

import * as React from "react"

export function makeApp(
    serverSettings: ServerSettings,
    clientSettings: ClientSettings
) {
    const app = express()

    // Parse cookies https://github.com/expressjs/cookie-parser
    app.use(cookieParser())

    app.use(express.urlencoded({ extended: true }))

    // Require authentication (only for /admin requests)
    app.use(authMiddleware)

    //app.use(express.urlencoded())

    app.use("/api", publicApi.router)

    app.use("/admin/api", api.router)
    app.use("/admin/test", makeTestPagesRouter(clientSettings))

    app.use("/admin/build", express.static("dist/webpack"))

    app.use("/admin", makeAdminRouter(clientSettings, serverSettings))

    // Default route: single page admin app
    app.get("/admin/*", (req, res) => {
        res.send(
            renderToHtmlPage(
                <AdminSPA
                    username={res.locals.user.fullName}
                    isSuperuser={res.locals.user.isSuperuser}
                    clientSettings={clientSettings}
                    serverSettings={serverSettings}
                />
            )
        )
    })

    // Send errors to Slack
    // The middleware passes all errors onto the next error-handling middleware
    if (serverSettings.SLACK_ERRORS_WEBHOOK_URL) {
        app.use(
            expressErrorSlack({
                webhookUri: serverSettings.SLACK_ERRORS_WEBHOOK_URL
            })
        )
    }

    // Give full error messages, including in production
    app.use(async (err: any, req: any, res: express.Response, next: any) => {
        if (!res.headersSent) {
            res.status(err.status || 500)
            res.send({
                error: { message: err.stack || err, status: err.status || 500 }
            })
        } else {
            res.write(
                JSON.stringify({
                    error: {
                        message: err.stack || err,
                        status: err.status || 500
                    }
                })
            )
            res.end()
        }
    })

    return app
}
