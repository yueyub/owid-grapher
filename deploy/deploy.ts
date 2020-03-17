import { SiteBaker } from "site/server/SiteBaker"
import { log } from "utils/server/log"

import { ServerSettings } from "serverSettings"
import { ClientSettings } from "clientSettings"

const clientSettings = new ClientSettings()
const serverSettings = new ServerSettings()
const baker = new SiteBaker(clientSettings, serverSettings)

export async function tryDeployAndTerminate(
    message: string = "Automated update",
    email?: string,
    name?: string
) {
    try {
        await baker.bakeAll()
        await baker.deploy(message, email, name)
    } catch (err) {
        log.error(err, serverSettings)
    } finally {
        baker.end()
    }
}

export async function deploy(
    message: string = "Automated update",
    email?: string,
    name?: string
) {
    try {
        await baker.bakeAll()
        await baker.deploy(message, email, name)
    } catch (err) {
        log.error(err, serverSettings)
        throw err
    }
}
