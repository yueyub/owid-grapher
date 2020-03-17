#!/usr/bin/env yarn tsn

import { SiteBaker } from "site/server/SiteBaker"
import { homedir } from "os"
import { ClientSettings } from "clientSettings"
import { ServerSettings } from "serverSettings"

const baker = new SiteBaker(new ClientSettings(), new ServerSettings())
const outputFolder = `${homedir()}/owid/charts/`

const main = async () => {
    //await baker.bakeChartsToFolder(outputFolder)
    await baker.bakeChartBySlug(outputFolder, "black-rhinos")
    baker.end()
}

main()
