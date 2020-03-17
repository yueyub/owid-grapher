// This import has side-effects to do with React import binding, keep it up here

import { ServerSettings } from "serverSettings"
import { ClientSettings } from "clientSettings"

import { makeApp } from "./app"

import * as db from "db/db"
import * as wpdb from "db/wpdb"
import { log } from "utils/server/log"

const serverSettings = new ServerSettings()
const clientSettings = new ClientSettings()

const app = makeApp(serverSettings, clientSettings)

async function main() {
    try {
        await db.connect()

        // The Grapher should be able to work without Wordpress being set up.
        try {
            await wpdb.dbInstance.connect()
        } catch (error) {
            console.error(error)
            console.log(
                "Could not connect to Wordpress database. Continuing without Wordpress..."
            )
        }

        app.listen(
            clientSettings.ADMIN_SERVER_PORT,
            clientSettings.ADMIN_SERVER_HOST,
            () => {
                console.log(
                    `owid-admin server started on ${clientSettings.ADMIN_SERVER_HOST}:${clientSettings.ADMIN_SERVER_PORT}`
                )
            }
        )
    } catch (err) {
        log.error(err, serverSettings)
        process.exit(1)
    }
}

main()
