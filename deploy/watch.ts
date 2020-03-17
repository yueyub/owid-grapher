import * as fs from "fs-extra"

import { ServerSettings } from "serverSettings"
const serverSettings = new ServerSettings()
const { DEPLOY_QUEUE_FILE_PATH } = serverSettings

import { triggerDeploy, queueIsEmpty } from "./queue"

async function main() {
    // Listen for file changes
    fs.watchFile(DEPLOY_QUEUE_FILE_PATH, () => {
        // Start deploy after 10 seconds in order to avoid the quick successive
        // deploys triggered by Wordpress.
        setTimeout(triggerDeploy, 10 * 1000)
    })

    if (!(await queueIsEmpty(serverSettings))) {
        triggerDeploy(serverSettings)
    }
}

main()
