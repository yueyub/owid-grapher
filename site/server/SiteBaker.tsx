import * as fs from "fs-extra"
import * as path from "path"
import * as glob from "glob"
import * as shell from "shelljs"
import * as lodash from "lodash"
import * as cheerio from "cheerio"
import * as wpdb from "db/wpdb"
import * as db from "db/db"
import * as React from "react"
import * as ReactDOMServer from "react-dom/server"
import { ClientSettings } from "clientSettings"
import { ServerSettings } from "serverSettings"

import { formatPost, extractFormattingOptions } from "./formatting"

import { LongFormPage } from "./views/LongFormPage"
import { BlogIndexPage } from "./views/BlogIndexPage"
import { FrontPage } from "./views/FrontPage"
import { ChartsIndexPage, ChartIndexItem } from "./views/ChartsIndexPage"
import { ExplorePage } from "./views/ExplorePage"
import { CovidPage } from "./views/CovidPage"
import { SearchPage } from "./views/SearchPage"
import { NotFoundPage } from "./views/NotFoundPage"
import { DonatePage } from "./views/DonatePage"
import { SubscribePage } from "./views/SubscribePage"
import {
    EntriesByYearPage,
    EntriesForYearPage
} from "./views/EntriesByYearPage"
import { VariableCountryPage } from "./views/VariableCountryPage"
import { FeedbackPage } from "./views/FeedbackPage"

import { JsonError } from "utils/server/serverUtil"
import { isExplorable, FORCE_EXPLORABLE_CHART_IDS } from "utils/charts"
import { Indicator } from "charts/Indicator"

import {
    bakeGrapherUrls,
    getGrapherExportsByUrl,
    GrapherExports
} from "./grapherUtil"
import { makeSitemap } from "./sitemap"

import { embedSnippet } from "./embedCharts"
import { ChartConfigProps } from "charts/ChartConfig"
import { Post } from "db/model/Post"
import { bakeCountries } from "./countryProfiles"
import { ChartBaker } from "./ChartBaker"

export class SiteBaker {
    private grapherExports!: GrapherExports
    private get baseDir() {
        return this.serverSettings.BASE_DIR
    }
    private get bakedSiteDirectory() {
        return this.serverSettings.BAKED_SITE_DIR
    }

    private get bakedSiteUrl() {
        return this.clientSettings.BAKED_BASE_URL
    }
    private get bakedGrapherUrl() {
        return this.clientSettings.BAKED_GRAPHER_URL
    }

    private clientSettings: ClientSettings
    private serverSettings: ServerSettings
    constructor(
        clientSettings: ClientSettings,
        serverSettings: ServerSettings
    ) {
        this.clientSettings = clientSettings
        this.serverSettings = serverSettings
    }

    stage(outPath: string, msg?: string) {
        console.log(msg || outPath)
    }

    private async bakeRedirects() {
        const redirects = [
            // RSS feed
            "/feed /atom.xml 302",

            // Backwards compatibility-- admin urls
            "/wp-admin/* https://owid.cloud/wp/wp-admin/:splat 301",
            "/grapher/admin/* https://owid.cloud/grapher/admin/:splat 301",

            // TODO: this should only get triggered by external hits (indexed .pdf files for instance)
            // and should be removed when no evidence of these inbound links can be found.
            "/wp-content/uploads/* /uploads/:splat 301",
            // TODO: temporary fix for the /blog page thumbnails, which paths are not being
            // transformed through the formatting step. Potentially applies to other
            // pages as well.
            "/app/uploads/* /uploads/:splat 301",

            // Backwards compatibility-- old Max stuff that isn't static-friendly
            "/roser/* https://www.maxroser.com/roser/:splat 301",
            "/uploads/nvd3/* https://www.maxroser.com/owidUploads/nvd3/:splat 301",
            "/uploads/datamaps/* https://www.maxroser.com/owidUploads/datamaps/:splat 301",
            "/slides/Max_PPT_presentations/* https://www.maxroser.com/slides/Max_PPT_presentations/:splat 301",
            "/slides/Max_Interactive_Presentations/* https://www.maxroser.com/slides/Max_Interactive_Presentations/:splat 301",

            // Backwards compatibility-- public urls
            "/entries/* /:splat 301",
            "/entries /#entries 302",
            "/data/food-agriculture/* /:splat 301",
            "/data/political-regimes/* /:splat 301",
            "/data/population-growth-vital-statistics/* /:splat 301",
            "/data/growth-and-distribution-of-prosperity/* /:splat 301",

            // Backwards compatibility-- grapher url style
            "/chart-builder/* /grapher/:splat 301",
            "/grapher/public/* /grapher/:splat 301",
            "/grapher/view/* /grapher/:splat 301",

            "/slides/* https://slides.ourworldindata.org/:splat 301"
        ]

        // Redirects from Wordpress admin UI
        const rows = await wpdb.dbInstance.query(
            `SELECT url, action_data, action_code FROM wp_redirection_items WHERE status = 'enabled'`
        )
        redirects.push(
            ...rows.map(
                row =>
                    `${row.url.replace(/__/g, "/")} ${row.action_data.replace(
                        /__/g,
                        "/"
                    )} ${row.action_code}`
            )
        )

        // Redirect /grapher/latest
        const latestRows = await db.query(
            `SELECT JSON_EXTRACT(config, "$.slug") as slug FROM charts where starred=1`
        )
        for (const row of latestRows) {
            redirects.push(
                `/grapher/latest /grapher/${JSON.parse(row.slug)} 302`
            )
        }

        // Redirect old slugs to new slugs
        const chartRedirectRows = await db.query(`
            SELECT chart_slug_redirects.slug, chart_id, JSON_EXTRACT(charts.config, "$.slug") as trueSlug
            FROM chart_slug_redirects INNER JOIN charts ON charts.id=chart_id
        `)

        for (const row of chartRedirectRows) {
            const trueSlug = JSON.parse(row.trueSlug)
            if (row.slug !== trueSlug) {
                redirects.push(`/grapher/${row.slug} /grapher/${trueSlug} 302`)
            }
        }

        await this.stageWrite(
            path.join(this.bakedSiteDirectory, `_redirects`),
            redirects.join("\n")
        )
    }

    private async bakeEmbeds() {
        // Find all grapher urls used as embeds in all posts on the site
        const rows = await wpdb.dbInstance.query(
            `SELECT post_content FROM wp_posts WHERE (post_type='page' OR post_type='post' OR post_type='wp_block') AND post_status='publish'`
        )
        let grapherUrls = []
        for (const row of rows) {
            const $ = cheerio.load(row.post_content)
            grapherUrls.push(
                ...$("iframe")
                    .toArray()
                    .filter(el =>
                        (el.attribs["src"] || "").match(/\/grapher\//)
                    )
                    .map(el => el.attribs["src"])
            )
        }
        grapherUrls = lodash.uniq(grapherUrls)

        await bakeGrapherUrls(
            grapherUrls,
            this.serverSettings,
            this.clientSettings
        )

        this.grapherExports = await getGrapherExportsByUrl(
            this.serverSettings,
            this.clientSettings
        )
    }

    // Bake an individual post/page
    private async bakePost(post: wpdb.FullPost) {
        const entries = await wpdb.dbInstance.getEntriesByCategory(
            this.clientSettings
        )
        const formattingOptions = extractFormattingOptions(post.content)
        const formatted = await formatPost(
            post,
            formattingOptions,
            this.clientSettings,
            this.serverSettings,
            this.grapherExports
        )
        const html = renderToHtmlPage(
            <LongFormPage
                entries={entries}
                post={formatted}
                formattingOptions={formattingOptions}
                clientSettings={this.clientSettings}
            />
        )

        const outPath = path.join(this.bakedSiteDirectory, `${post.slug}.html`)
        await fs.mkdirp(path.dirname(outPath))
        await this.stageWrite(outPath, html)
    }

    // Bake all Wordpress posts, both blog posts and entry pages
    private async bakePosts() {
        const postsApi = await wpdb.dbInstance.getPosts(this.clientSettings)

        const postSlugs = []
        for (const postApi of postsApi) {
            const post = wpdb.dbInstance.getFullPost(
                postApi,
                this.clientSettings.BAKED_BASE_URL
            )
            // blog: handled separately
            // isPostEmbedded: post displayed in the entry only (not on its own
            // page), skipping.
            if (post.slug === "blog" || wpdb.dbInstance.isPostEmbedded(post))
                continue

            postSlugs.push(post.slug)
            await this.bakePost(post)
        }

        // Maxes out resources (TODO: RCA)
        // await Promise.all(bakingPosts.map(post => this.bakePost(post)))

        // Delete any previously rendered posts that aren't in the database
        const existingSlugs = glob
            .sync(`${this.bakedSiteDirectory}/**/*.html`)
            .map(path =>
                path
                    .replace(`${this.bakedSiteDirectory}/`, "")
                    .replace(".html", "")
            )
            .filter(
                path =>
                    !path.startsWith("uploads") &&
                    !path.startsWith("grapher") &&
                    !path.startsWith("countries") &&
                    !path.startsWith("country") &&
                    !path.startsWith("subscribe") &&
                    !path.startsWith("blog") &&
                    !path.startsWith("entries-by-year") &&
                    !path.startsWith("explore") &&
                    path !== "donate" &&
                    path !== "feedback" &&
                    path !== "charts" &&
                    path !== "search" &&
                    path !== "index" &&
                    path !== "identifyadmin" &&
                    path !== "404" &&
                    path !== "google8272294305985984"
            )
        const toRemove = lodash.without(existingSlugs, ...postSlugs)
        for (const slug of toRemove) {
            const outPath = `${this.bakedSiteDirectory}/${slug}.html`
            await fs.unlink(outPath)
            this.stage(outPath, `DELETING ${outPath}`)
        }
    }

    // Bake unique individual pages
    private async bakeSpecialPages(bakeExplorerPage: boolean) {
        await this.stageWrite(
            `${this.bakedSiteDirectory}/index.html`,
            await renderFrontPage(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/subscribe.html`,
            await renderSubscribePage(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/donate.html`,
            await renderDonatePage(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/feedback.html`,
            await feedbackPage(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/charts.html`,
            await renderChartsPage(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/search.html`,
            await renderSearchPage(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/404.html`,
            await renderNotFoundPage(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/headerMenu.json`,
            await renderMenuJson(this.clientSettings)
        )
        await this.stageWrite(
            `${this.bakedSiteDirectory}/sitemap.xml`,
            await makeSitemap()
        )
        if (bakeExplorerPage) {
            await this.stageWrite(
                `${this.bakedSiteDirectory}/explore.html`,
                await renderExplorePage(this.clientSettings)
            )
            await this.stageWrite(
                `${this.bakedSiteDirectory}/explore/indicators.json`,
                await renderExplorableIndicatorsJson()
            )
        }
    }

    // Pages that are expected by google scholar for indexing
    private async bakeGoogleScholar() {
        await this.stageWrite(
            `${this.bakedSiteDirectory}/entries-by-year/index.html`,
            await entriesByYearPage(this.clientSettings)
        )

        const rows = (await db
            .table(Post.table)
            .where({ status: "publish" })
            .join("post_tags", { "post_tags.post_id": "posts.id" })
            .join("tags", { "tags.id": "post_tags.tag_id" })
            .where({ "tags.name": "Entries" })
            .select(db.raw("distinct year(published_at) as year"))
            .orderBy("year", "DESC")) as { year: number }[]

        const years = rows.map(r => r.year)

        for (const year of years) {
            await this.stageWrite(
                `${this.bakedSiteDirectory}/entries-by-year/${year}.html`,
                await entriesByYearPage(this.clientSettings, year)
            )
        }
    }

    // Bake the blog index
    private async bakeBlogIndex(blogPostsPerPage: number) {
        const allPosts = await wpdb.dbInstance.getBlogIndex(this.clientSettings)
        const numPages = Math.ceil(allPosts.length / blogPostsPerPage)

        for (let i = 1; i <= numPages; i++) {
            const slug = i === 1 ? "blog" : `blog/page/${i}`
            const html = await renderBlogByPageNum(
                i,
                blogPostsPerPage,
                this.clientSettings
            )
            await this.stageWrite(
                `${this.bakedSiteDirectory}/${slug}.html`,
                html
            )
        }
    }

    // Bake the RSS feed
    private async bakeRSS() {
        await this.stageWrite(
            `${this.bakedSiteDirectory}/atom.xml`,
            await makeAtomFeed(this.clientSettings)
        )
    }

    // Bake the static assets
    private async bakeAssets(wordPressDirectory: string) {
        shell.exec(
            `rsync -havL --delete ${wordPressDirectory}/web/app/uploads ${this.bakedSiteDirectory}/`
        )
        shell.exec(
            `rm -rf ${this.bakedSiteDirectory}/assets && cp -r ${this.baseDir}/dist/webpack ${this.bakedSiteDirectory}/assets`
        )
        shell.exec(
            `rsync -hav --delete ${this.baseDir}/public/* ${this.bakedSiteDirectory}/`
        )

        await fs.writeFile(
            `${this.bakedSiteDirectory}/grapher/embedCharts.js`,
            embedSnippet(this.clientSettings)
        )
        this.stage(`${this.bakedSiteDirectory}/grapher/embedCharts.js`)
    }

    private async getAllCharts() {
        const rows: any[] = await db.query(
            `SELECT id, config FROM charts WHERE JSON_EXTRACT(config, "$.isPublished")=true ORDER BY JSON_EXTRACT(config, "$.slug") ASC`
        )
        return rows.map(row => {
            const chart: ChartConfigProps = JSON.parse(row.config)
            chart.id = row.id
            return chart
        })
    }

    async bakeChartBySlug(outputFolder: string, slug: string) {
        const charts = await this.getAllCharts()
        const chart = charts.filter(chart => chart.slug === slug)[0]
        if (!chart) throw new Error(`No chart with slug '${slug}'`)
        const baker = new ChartBaker(chart, outputFolder, this.clientSettings)
        await baker.bakeAll()
    }

    async bakeChartsToFolder(outputFolder: string) {
        let requests = []
        const charts = await this.getAllCharts()
        const batchSize = 1
        let currentIndex = 0
        for (const chart of charts) {
            console.log(
                `Baking chart ${currentIndex}/${charts.length} '${chart.slug}'`
            )
            currentIndex++
            requests.push(
                new ChartBaker(
                    chart,
                    outputFolder,
                    this.clientSettings
                ).bakeAll()
            )
            // Execute in batches
            if (requests.length > batchSize) {
                await Promise.all(requests)
                requests = []
            }
        }

        return Promise.all(requests)
    }

    private async _removeDeletedCharts() {
        const charts = await this.getAllCharts()
        const newSlugs = charts.map(chart => chart.slug)
        // Delete any that are missing from the database
        const oldSlugs = glob
            .sync(`${this.bakedSiteDirectory}/grapher/*.html`)
            .map(slug =>
                slug
                    .replace(`${this.bakedSiteDirectory}/grapher/`, "")
                    .replace(".html", "")
            )
        const toRemove = lodash.without(oldSlugs, ...newSlugs)
        for (const slug of toRemove) {
            console.log(`DELETING ${slug}`)
            try {
                const paths = [
                    `${this.bakedSiteDirectory}/grapher/${slug}.html`,
                    `${this.bakedSiteDirectory}/grapher/exports/${slug}.png`
                ] //, `${this.bakedSiteDirectory}/grapher/exports/${slug}.svg`]
                await Promise.all(paths.map(p => fs.unlink(p)))
                paths.map(p => this.stage(p))
            } catch (err) {
                console.error(err)
            }
        }
    }

    async bakeAll() {
        this.flushCache()
        await this.bakeRedirects()
        await this.bakeEmbeds()
        await this.bakeBlogIndex(this.clientSettings.BLOG_POSTS_PER_PAGE)
        await bakeCountries(this)
        await this.bakeRSS()
        await this.bakeAssets(this.serverSettings.WORDPRESS_DIR)
        await this.bakeSpecialPages(this.clientSettings.EXPLORER)
        await this.bakeGoogleScholar()
        await this.bakePosts()
        await this.bakeChartsToFolder(`${this.bakedSiteDirectory}/`)
        await this._removeDeletedCharts()
    }

    async ensureDir(relPath: string) {
        const outPath = path.join(this.bakedSiteDirectory, relPath)
        await fs.mkdirp(outPath)
    }

    async writeFile(relPath: string, content: string) {
        const outPath = path.join(this.bakedSiteDirectory, relPath)
        await fs.writeFile(outPath, content)
        this.stage(outPath)
    }

    private async stageWrite(outPath: string, content: string) {
        await fs.mkdirp(path.dirname(outPath))
        await fs.writeFile(outPath, content)
        this.stage(outPath)
    }

    private exec(cmd: string) {
        console.log(cmd)
        shell.exec(cmd)
    }

    async deploy(commitMsg: string, authorEmail?: string, authorName?: string) {
        // Deploy directly to Netlify (faster than using the github hook)
        if (
            fs.existsSync(
                path.join(this.bakedSiteDirectory, ".netlify/state.json")
            )
        ) {
            this.exec(
                `cd ${this.bakedSiteDirectory} && ${this.baseDir}/node_modules/.bin/netlify deploy -d . --prod`
            )
        }

        // Ensure there is a git repo in there
        this.exec(`cd ${this.bakedSiteDirectory} && git init`)

        // Prettify HTML source for easier debugging
        // Target root level HTML files only (entries and posts) for performance
        // reasons.
        // TODO: check again --only-changed
        // this.exec(`cd ${this.bakedSiteDirectory} && ${this.baseDir}/node_modules/.bin/prettier --write "./*.html"`)

        if (authorEmail && authorName && commitMsg) {
            this.exec(
                `cd ${this.bakedSiteDirectory} && git add -A . && git commit --author='${authorName} <${authorEmail}>' -a -m '${commitMsg}' && git push origin master`
            )
        } else {
            this.exec(
                `cd ${this.bakedSiteDirectory} && git add -A . && git commit -a -m '${commitMsg}' && git push origin master`
            )
        }
    }

    end() {
        wpdb.dbInstance.end()
        db.end()
    }

    private flushCache() {
        wpdb.dbInstance.flushCache()
    }
}

// Wrap ReactDOMServer to stick the doctype on
export function renderToHtmlPage(element: any) {
    return `<!doctype html>${ReactDOMServer.renderToStaticMarkup(element)}`
}

export async function renderChartsPage(clientSettings: ClientSettings) {
    const chartItems = (await db.query(`
        SELECT
            id,
            config->>"$.slug" AS slug,
            config->>"$.title" AS title,
            config->>"$.variantName" AS variantName
        FROM charts
        WHERE
            is_indexable IS TRUE
            AND publishedAt IS NOT NULL
            AND config->"$.isPublished" IS TRUE
    `)) as ChartIndexItem[]

    const chartTags = await db.query(`
        SELECT ct.chartId, ct.tagId, t.name as tagName, t.parentId as tagParentId FROM chart_tags ct
        JOIN charts c ON c.id=ct.chartId
        JOIN tags t ON t.id=ct.tagId
    `)

    for (const c of chartItems) {
        c.tags = []
    }

    const chartsById = lodash.keyBy(chartItems, c => c.id)

    for (const ct of chartTags) {
        const c = chartsById[ct.chartId]
        if (c) c.tags.push({ id: ct.tagId, name: ct.tagName })
    }

    return renderToHtmlPage(
        <ChartsIndexPage
            chartItems={chartItems}
            clientSettings={clientSettings}
        />
    )
}

export async function renderExplorePage(clientSettings: ClientSettings) {
    return renderToHtmlPage(<ExplorePage clientSettings={clientSettings} />)
}

// Only used in the dev server
export async function renderCovidPage(clientSettings: ClientSettings) {
    return renderToHtmlPage(<CovidPage clientSettings={clientSettings} />)
}

export async function renderExplorableIndicatorsJson() {
    const query: { id: number; config: any }[] = await db.query(
        `
        SELECT id, config
        FROM charts
        WHERE charts.isExplorable
        ${FORCE_EXPLORABLE_CHART_IDS.length ? `OR charts.id IN (?)` : ""}
        `,
        [FORCE_EXPLORABLE_CHART_IDS]
    )

    const explorableCharts = query
        .map(chart => ({
            id: chart.id,
            config: JSON.parse(chart.config) as ChartConfigProps
        }))
        // Ensure config is consistent with the current "explorable" requirements
        .filter(chart => isExplorable(chart.config))

    const result: Indicator[] = explorableCharts.map(chart => ({
        id: chart.id,
        title: chart.config.title,
        subtitle: chart.config.subtitle,
        sourceDesc: chart.config.sourceDesc,
        note: chart.config.note,
        dimensions: chart.config.dimensions,
        map: chart.config.map
    }))

    return JSON.stringify({ indicators: result })
}

export async function renderPageBySlug(
    slug: string,
    serverSettings: ServerSettings,
    clientSettings: ClientSettings
) {
    const postApiArray = await wpdb.dbInstance.getPostBySlug(
        slug,
        clientSettings
    )
    if (!postApiArray.length)
        throw new JsonError(`No page found by slug ${slug}`, 404)

    return renderPage(postApiArray[0], serverSettings, clientSettings)
}

export async function renderPageById(
    id: number,
    clientSettings: ClientSettings,
    serverSettings: ServerSettings,
    isPreview?: boolean
): Promise<string> {
    let postApi = await wpdb.dbInstance.getPost(id, clientSettings)
    if (isPreview) {
        const revision = await wpdb.dbInstance.getLatestPostRevision(
            id,
            clientSettings
        )
        postApi = {
            ...revision,
            authors_name: postApi.authors_name,
            type: postApi.type,
            path: postApi.path,
            postId: id
        }
    }
    return renderPage(postApi, serverSettings, clientSettings)
}

export async function renderMenuJson(clientSettings: ClientSettings) {
    const categories = await wpdb.dbInstance.getEntriesByCategory(
        clientSettings
    )
    return JSON.stringify({ categories: categories })
}

async function renderPage(
    postApi: object,
    serverSettings: ServerSettings,
    clientSettings: ClientSettings
) {
    const post = wpdb.dbInstance.getFullPost(
        postApi,
        clientSettings.BAKED_BASE_URL
    )
    const entries = await wpdb.dbInstance.getEntriesByCategory(clientSettings)

    const cheerioPage = cheerio.load(post.content)

    const grapherUrls = cheerioPage("iframe")
        .toArray()
        .filter(el => (el.attribs["src"] || "").match(/\/grapher\//))
        .map(el => el.attribs["src"])

    // This can be slow if uncached!
    await bakeGrapherUrls(grapherUrls, serverSettings, clientSettings)

    const exportsByUrl = await getGrapherExportsByUrl(
        serverSettings,
        clientSettings
    )

    // Extract formatting options from post HTML comment (if any)
    const formattingOptions = extractFormattingOptions(post.content)
    const formatted = await formatPost(
        post,
        formattingOptions,
        clientSettings,
        serverSettings,
        exportsByUrl
    )

    return renderToHtmlPage(
        <LongFormPage
            entries={entries}
            post={formatted}
            formattingOptions={formattingOptions}
            clientSettings={clientSettings}
        />
    )
}

export async function renderFrontPage(clientSettings: ClientSettings) {
    const entries = await wpdb.dbInstance.getEntriesByCategory(clientSettings)
    const posts = await wpdb.dbInstance.getBlogIndex(clientSettings)
    const totalCharts = (
        await db.query(`SELECT COUNT(*) as count FROM charts`)
    )[0].count as number
    return renderToHtmlPage(
        <FrontPage
            entries={entries}
            posts={posts}
            totalCharts={totalCharts}
            clientSettings={clientSettings}
        />
    )
}
export async function renderDonatePage(clientSettings: ClientSettings) {
    return renderToHtmlPage(<DonatePage clientSettings={clientSettings} />)
}

export async function renderSubscribePage(clientSettings: ClientSettings) {
    return renderToHtmlPage(<SubscribePage clientSettings={clientSettings} />)
}

export async function renderBlogByPageNum(
    pageNum: number,
    blogPostsPerPage: number,
    clientSettings: ClientSettings
) {
    const allPosts = await wpdb.dbInstance.getBlogIndex(clientSettings)

    const numPages = Math.ceil(allPosts.length / blogPostsPerPage)
    const posts = allPosts.slice(
        (pageNum - 1) * blogPostsPerPage,
        pageNum * blogPostsPerPage
    )

    return renderToHtmlPage(
        <BlogIndexPage
            posts={posts}
            pageNum={pageNum}
            numPages={numPages}
            clientSettings={clientSettings}
        />
    )
}

export async function renderSearchPage(clientSettings: ClientSettings) {
    return renderToHtmlPage(<SearchPage clientSettings={clientSettings} />)
}

export async function renderNotFoundPage(clientSettings: ClientSettings) {
    return renderToHtmlPage(<NotFoundPage clientSettings={clientSettings} />)
}

export async function makeAtomFeed(clientSettings: ClientSettings) {
    const bakedBaseUrl = clientSettings.BAKED_BASE_URL
    const postsApi = await wpdb.dbInstance.getPosts(
        clientSettings,
        ["post"],
        10
    )
    const posts: wpdb.FullPost[] = postsApi.map(postApi =>
        wpdb.dbInstance.getFullPost(postApi, bakedBaseUrl, true)
    )

    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Our World in Data</title>
<subtitle>Research and data to make progress against the world’s largest problems</subtitle>
<id>${bakedBaseUrl}/</id>
<link type="text/html" rel="alternate" href="${bakedBaseUrl}"/>
<link type="application/atom+xml" rel="self" href="${bakedBaseUrl}/atom.xml"/>
<updated>${posts[0].date.toISOString()}</updated>
${posts
    .map(
        post => `<entry>
    <title><![CDATA[${post.title}]]></title>
    <id>${bakedBaseUrl}/${post.path}</id>
    <link rel="alternate" href="${bakedBaseUrl}/${post.path}"/>
    <published>${post.date.toISOString()}</published>
    <updated>${post.modifiedDate.toISOString()}</updated>
    ${post.authors
        .map((author: string) => `<author><name>${author}</name></author>`)
        .join("")}
    <summary><![CDATA[${post.excerpt}]]></summary>
</entry>`
    )
    .join("\n")}
</feed>
`

    return feed
}

// These pages exist largely just for Google Scholar
export async function entriesByYearPage(
    clientSettings: ClientSettings,
    year?: number
) {
    const entries = (await db
        .table(Post.table)
        .where({ status: "publish" })
        .join("post_tags", { "post_tags.post_id": "posts.id" })
        .join("tags", { "tags.id": "post_tags.tag_id" })
        .where({ "tags.name": "Entries" })
        .select("title", "slug", "published_at")) as Pick<
        Post.Row,
        "title" | "slug" | "published_at"
    >[]

    if (year !== undefined)
        return renderToHtmlPage(
            <EntriesForYearPage
                entries={entries}
                year={year}
                clientSettings={clientSettings}
            />
        )
    else
        return renderToHtmlPage(
            <EntriesByYearPage
                entries={entries}
                clientSettings={clientSettings}
            />
        )
}

export async function pagePerVariable(
    variableId: number,
    countryName: string,
    clientSettings: ClientSettings
) {
    const variable = await db.get(
        `
        SELECT v.id, v.name, v.unit, v.shortUnit, v.description, v.sourceId, u.fullName AS uploadedBy,
               v.display, d.id AS datasetId, d.name AS datasetName, d.namespace AS datasetNamespace
        FROM variables v
        JOIN datasets d ON d.id=v.datasetId
        JOIN users u ON u.id=d.dataEditedByUserId
        WHERE v.id = ?
    `,
        [variableId]
    )

    if (!variable) {
        throw new JsonError(`No variable by id '${variableId}'`, 404)
    }

    variable.display = JSON.parse(variable.display)
    variable.source = await db.get(
        `SELECT id, name FROM sources AS s WHERE id = ?`,
        variable.sourceId
    )

    const country = await db
        .table("entities")
        .select("id", "name")
        .whereRaw("lower(name) = ?", [countryName])
        .first()

    return renderToHtmlPage(
        <VariableCountryPage
            variable={variable}
            country={country}
            clientSettings={clientSettings}
        />
    )
}

export async function feedbackPage(clientSettings: ClientSettings) {
    return renderToHtmlPage(<FeedbackPage clientSettings={clientSettings} />)
}
