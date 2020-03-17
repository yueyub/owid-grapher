import * as algoliasearch from "algoliasearch"
import * as lodash from "lodash"

import * as db from "db/db"
import { ClientSettings } from "clientSettings"
import { ServerSettings } from "serverSettings"
import { configureAlgolia } from "./configureAlgolia"

async function indexChartsToAlgolia(
    clientSettings = new ClientSettings(),
    serverSettings = new ServerSettings()
) {
    await configureAlgolia(clientSettings, serverSettings)

    const allCharts = await db.query(`
        SELECT id, publishedAt, updatedAt, JSON_LENGTH(config->"$.dimensions") AS numDimensions, config->>"$.type" AS type, config->>"$.slug" AS slug, config->>"$.title" AS title, config->>"$.subtitle" AS subtitle, config->>"$.variantName" AS variantName, config->>"$.data.availableEntities" as availableEntitiesStr
        FROM charts
        WHERE publishedAt IS NOT NULL
        AND is_indexable IS TRUE
    `)

    const chartTags = await db.query(`
        SELECT ct.chartId, ct.tagId, t.name as tagName FROM chart_tags ct
        JOIN charts c ON c.id=ct.chartId
        JOIN tags t ON t.id=ct.tagId
    `)

    for (const c of allCharts) {
        c.tags = []
    }

    const chartsById = lodash.keyBy(allCharts, c => c.id)

    const chartsToIndex = []
    for (const ct of chartTags) {
        const c = chartsById[ct.chartId]
        if (c) {
            c.tags.push({ id: ct.tagId, name: ct.tagName })
            chartsToIndex.push(c)
        }
    }

    const client = algoliasearch(
        clientSettings.ALGOLIA_ID,
        serverSettings.ALGOLIA_SECRET_KEY
    )
    const finalIndex = await client.initIndex("charts")
    const tmpIndex = await client.initIndex("charts_tmp")

    await client.copyIndex(finalIndex.indexName, tmpIndex.indexName, [
        "settings",
        "synonyms",
        "rules"
    ])

    const records = []
    for (const c of chartsToIndex) {
        if (!c.tags) continue

        records.push({
            objectID: c.id,
            chartId: c.id,
            slug: c.slug,
            title: c.title,
            variantName: c.variantName,
            subtitle: c.subtitle,
            _tags: c.tags.map((t: any) => t.name),
            availableEntities: JSON.parse(c.availableEntitiesStr),
            publishedAt: c.publishedAt,
            updatedAt: c.updatedAt,
            numDimensions: parseInt(c.numDimensions),
            titleLength: c.title.length
        })
    }

    console.log(records.length)

    await tmpIndex.saveObjects(records)
    await client.moveIndex(tmpIndex.indexName, finalIndex.indexName)
    // for (let i = 0; i < records.length; i += 1000) {
    //     console.log(i)
    //     await index.saveObjects(records.slice(i, i+1000))
    // }

    await db.end()
}

indexChartsToAlgolia()
