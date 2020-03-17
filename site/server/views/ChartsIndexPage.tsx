import { ClientSettings } from "clientSettings"
import * as React from "react"
import { Head } from "./Head"
import { SiteHeader } from "./SiteHeader"
import { SiteFooter } from "./SiteFooter"
import * as lodash from "lodash"

export interface ChartIndexItem {
    id: number
    title: string
    slug: string
    variantName?: string
    tags: { id: number; name: string }[]
}

export interface TagWithCharts {
    id: number
    name: string
    charts: ChartIndexItem[]
}

export const ChartsIndexPage = (props: {
    chartItems: ChartIndexItem[]
    clientSettings: ClientSettings
}) => {
    const { chartItems, clientSettings } = props

    const allTags = lodash.sortBy(
        lodash.uniqBy(lodash.flatten(chartItems.map(c => c.tags)), t => t.id),
        t => t.name
    ) as TagWithCharts[]

    for (const c of chartItems) {
        for (const tag of allTags) {
            if (tag.charts === undefined) tag.charts = []

            if (c.tags.some(t => t.id === tag.id)) tag.charts.push(c)
        }
    }

    // Sort the charts in each tag
    for (const tag of allTags) {
        tag.charts = lodash.sortBy(tag.charts, c => c.title.trim())
    }

    return (
        <html>
            <Head
                clientSettings={clientSettings}
                canonicalUrl={`${clientSettings.BAKED_BASE_URL}/charts`}
                pageTitle="Charts"
                pageDesc="All of the interactive charts on Our World in Data."
            />
            <body className="ChartsIndexPage">
                <SiteHeader />
                <main>
                    <header className="chartsHeader">
                        <input
                            type="search"
                            className="chartsSearchInput"
                            placeholder="Filter interactive charts by title"
                            autoFocus
                        />
                    </header>
                    {allTags.map(t => (
                        <section key={t.id}>
                            <h2>{t.name}</h2>
                            <ul>
                                {t.charts.map(c => (
                                    <li key={c.id}>
                                        <a href={`/grapher/${c.slug}`}>
                                            {c.title}{" "}
                                            {c.variantName
                                                ? `(${c.variantName})`
                                                : undefined}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </main>
                <SiteFooter clientSettings={clientSettings} />
                <script>{`window.runChartsIndexPage()`}</script>
            </body>
        </html>
    )
}
