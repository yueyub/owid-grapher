import * as fs from "fs-extra"
import * as path from "path"
import * as glob from "glob"
import { without } from "lodash"
import * as shell from "shelljs"
import * as _ from "lodash"
import * as cheerio from "cheerio"
import * as wpdb from "db/wpdb"
import * as db from "db/db"
import * as settings from "settings"
import { formatPost, extractFormattingOptions } from "./formatting"
import { LongFormPage } from "./views/LongFormPage"
import { BASE_DIR, BAKED_SITE_DIR, WORDPRESS_DIR } from "serverSettings"
const { BLOG_POSTS_PER_PAGE, OPTIMIZE_SVG_EXPORTS } = settings
import {
    renderToHtmlPage,
    renderFrontPage,
    renderSubscribePage,
    renderBlogByPageNum,
    renderChartsPage,
    renderExplorePage,
    renderMenuJson,
    renderSearchPage,
    renderDonatePage,
    entriesByYearPage,
    makeAtomFeed,
    feedbackPage,
    renderNotFoundPage,
    renderExplorableIndicatorsJson,
    renderCovidChartBuilderPage
} from "./siteBaking"
import {
    bakeGrapherUrls,
    getGrapherExportsByUrl,
    GrapherExports
} from "./grapherUtil"
import { makeSitemap } from "./sitemap"

import * as React from "react"
import { embedSnippet } from "./embedCharts"
import { ChartConfigProps } from "charts/ChartConfig"
import { getVariableData } from "db/model/Variable"
import { bakeImageExports } from "./svgPngExport"
import { Post } from "db/model/Post"
import { bakeCountries } from "./countryProfiles"
import { chartPageFromConfig } from "./chartBaking"
import { countries } from "utils/countries"

// Static site generator using Wordpress

export interface SiteBakerProps {
    forceUpdate?: boolean
}

export class SiteBaker {
    props: SiteBakerProps
    grapherExports!: GrapherExports
    constructor(props: SiteBakerProps) {
        this.props = props
    }

    static getCountryDetectionRedirects() {
        return countries
            .filter(country => country.iso3166 && country.code)
            .map(
                country =>
                    `/detect-country-redirect /detect-country.js?${
                        country.code
                    } 302! Country=${country.iso3166!.toLowerCase()}`
            )
    }

    async bakeRedirects() {
        const redirects = [
            // RSS feed
            "/feed /atom.xml 302!",

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

        SiteBaker.getCountryDetectionRedirects().forEach(redirect =>
            redirects.push(redirect)
        )

        // Redirects from Wordpress admin UI
        const rows = await wpdb.query(
            `SELECT url, action_data, action_code FROM wp_redirection_items WHERE status = 'enabled'`
        )
        redirects.push(
            ...rows.map(
                row =>
                    `${row.url.replace(/__/g, "/")} ${row.action_data.replace(
                        /__/g,
                        "/"
                    )} ${row.action_code}!`
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
                redirects.push(`/grapher/${row.slug} /grapher/${trueSlug} 302!`)
            }
        }

        await this.stageWrite(
            path.join(BAKED_SITE_DIR, `_redirects`),
            redirects.join("\n")
        )
    }

    async bakeEmbeds() {
        // Find all grapher urls used as embeds in all posts on the site
        const rows = await wpdb.query(
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
        grapherUrls = _.uniq(grapherUrls)

        await bakeGrapherUrls(grapherUrls)

        this.grapherExports = await getGrapherExportsByUrl()
    }

    // Bake an individual post/page
    async bakePost(post: wpdb.FullPost) {
        const entries = await wpdb.getEntriesByCategory()
        const formattingOptions = extractFormattingOptions(post.content)
        const formatted = await formatPost(
            post,
            formattingOptions,
            this.grapherExports
        )
        const html = renderToHtmlPage(
            <LongFormPage
                entries={entries}
                post={formatted}
                formattingOptions={formattingOptions}
            />
        )

        const outPath = path.join(BAKED_SITE_DIR, `${post.slug}.html`)
        await fs.mkdirp(path.dirname(outPath))
        await this.stageWrite(outPath, html)
    }

    // Bake all Wordpress posts, both blog posts and entry pages
    async bakePosts() {
        const postsApi = await wpdb.getPosts()

        const postSlugs = []
        for (const postApi of postsApi) {
            const post = await wpdb.getFullPost(postApi)
            // blog: handled separately
            // isPostEmbedded: post displayed in the entry only (not on its own
            // page), skipping.
            if (post.slug === "blog" || wpdb.isPostEmbedded(post)) continue

            postSlugs.push(post.slug)
            await this.bakePost(post)
        }

        // Maxes out resources (TODO: RCA)
        // await Promise.all(bakingPosts.map(post => this.bakePost(post)))

        // Delete any previously rendered posts that aren't in the database
        const existingSlugs = glob
            .sync(`${BAKED_SITE_DIR}/**/*.html`)
            .map(path =>
                path.replace(`${BAKED_SITE_DIR}/`, "").replace(".html", "")
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
                    !path.startsWith("covid-chart-builder") &&
                    path !== "donate" &&
                    path !== "feedback" &&
                    path !== "charts" &&
                    path !== "search" &&
                    path !== "index" &&
                    path !== "identifyadmin" &&
                    path !== "404" &&
                    path !== "google8272294305985984"
            )
        const toRemove = without(existingSlugs, ...postSlugs)
        for (const slug of toRemove) {
            const outPath = `${BAKED_SITE_DIR}/${slug}.html`
            await fs.unlink(outPath)
            this.stage(outPath, `DELETING ${outPath}`)
        }
    }

    // Bake unique individual pages
    async bakeSpecialPages() {
        await this.stageWrite(
            `${BAKED_SITE_DIR}/index.html`,
            await renderFrontPage()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/subscribe.html`,
            await renderSubscribePage()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/donate.html`,
            await renderDonatePage()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/feedback.html`,
            await feedbackPage()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/charts.html`,
            await renderChartsPage()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/search.html`,
            await renderSearchPage()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/404.html`,
            await renderNotFoundPage()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/headerMenu.json`,
            await renderMenuJson()
        )
        await this.stageWrite(
            `${BAKED_SITE_DIR}/sitemap.xml`,
            await makeSitemap()
        )
        if (settings.EXPLORER) {
            await this.stageWrite(
                `${BAKED_SITE_DIR}/explore.html`,
                await renderExplorePage()
            )
            await this.stageWrite(
                `${BAKED_SITE_DIR}/explore/indicators.json`,
                await renderExplorableIndicatorsJson()
            )
        }
        await this.stageWrite(
            `${BAKED_SITE_DIR}/covid-chart-builder.html`,
            await renderCovidChartBuilderPage()
        )
    }

    // Pages that are expected by google scholar for indexing
    async bakeGoogleScholar() {
        await this.stageWrite(
            `${BAKED_SITE_DIR}/entries-by-year/index.html`,
            await entriesByYearPage()
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
                `${BAKED_SITE_DIR}/entries-by-year/${year}.html`,
                await entriesByYearPage(year)
            )
        }
    }

    // Bake the blog index
    async bakeBlogIndex() {
        const allPosts = await wpdb.getBlogIndex()
        const numPages = Math.ceil(allPosts.length / BLOG_POSTS_PER_PAGE)

        for (let i = 1; i <= numPages; i++) {
            const slug = i === 1 ? "blog" : `blog/page/${i}`
            const html = await renderBlogByPageNum(i)
            await this.stageWrite(`${BAKED_SITE_DIR}/${slug}.html`, html)
        }
    }

    // Bake the RSS feed
    async bakeRSS() {
        await this.stageWrite(
            `${BAKED_SITE_DIR}/atom.xml`,
            await makeAtomFeed()
        )
    }

    // Bake the static assets
    async bakeAssets() {
        shell.exec(
            `rsync -havL --delete ${WORDPRESS_DIR}/web/app/uploads ${BAKED_SITE_DIR}/`
        )
        shell.exec(
            `rm -rf ${BAKED_SITE_DIR}/assets && cp -r ${BASE_DIR}/dist/webpack ${BAKED_SITE_DIR}/assets`
        )
        shell.exec(
            `rsync -hav --delete ${BASE_DIR}/public/* ${BAKED_SITE_DIR}/`
        )

        await fs.writeFile(
            `${BAKED_SITE_DIR}/grapher/embedCharts.js`,
            embedSnippet()
        )
        this.stage(`${BAKED_SITE_DIR}/grapher/embedCharts.js`)
    }

    async bakeVariableData(
        variableIds: number[],
        outPath: string
    ): Promise<string> {
        await fs.mkdirp(`${BAKED_SITE_DIR}/grapher/data/variables/`)
        const vardata = await getVariableData(variableIds)
        await fs.writeFile(outPath, JSON.stringify(vardata))
        this.stage(outPath)
        return vardata
    }

    async bakeChartPage(chart: ChartConfigProps) {
        const outPath = `${BAKED_SITE_DIR}/grapher/${chart.slug}.html`
        await fs.writeFile(outPath, await chartPageFromConfig(chart))
        this.stage(outPath)
    }

    async bakeChart(chart: ChartConfigProps) {
        const htmlPath = `${BAKED_SITE_DIR}/grapher/${chart.slug}.html`
        let isSameVersion = false
        try {
            // If the chart is the same version, we can potentially skip baking the data and exports (which is by far the slowest part)
            const html = await fs.readFile(htmlPath, "utf8")
            const match = html.match(/jsonConfig\s*=\s*(\{.+\})/)
            if (match) {
                const fileVersion = JSON.parse(match[1]).version
                isSameVersion = chart.version === fileVersion
            }
        } catch (err) {
            if (err.code !== "ENOENT") console.error(err)
        }

        // Always bake the html for every chart; it's cheap to do so
        await this.bakeChartPage(chart)

        const variableIds = _.uniq(chart.dimensions.map(d => d.variableId))
        if (!variableIds.length) return

        // Make sure we bake the variables successfully before outputing the chart html
        const vardataPath = `${BAKED_SITE_DIR}/grapher/data/variables/${variableIds.join(
            "+"
        )}.json`
        if (!isSameVersion || !fs.existsSync(vardataPath)) {
            await this.bakeVariableData(variableIds, vardataPath)
        }

        try {
            await fs.mkdirp(`${BAKED_SITE_DIR}/grapher/exports/`)
            const svgPath = `${BAKED_SITE_DIR}/grapher/exports/${chart.slug}.svg`
            const pngPath = `${BAKED_SITE_DIR}/grapher/exports/${chart.slug}.png`
            if (
                !isSameVersion ||
                !fs.existsSync(svgPath) ||
                !fs.existsSync(pngPath)
            ) {
                const vardata = JSON.parse(
                    await fs.readFile(vardataPath, "utf8")
                )
                await bakeImageExports(
                    `${BAKED_SITE_DIR}/grapher/exports`,
                    chart,
                    vardata,
                    OPTIMIZE_SVG_EXPORTS
                )
                this.stage(svgPath)
                this.stage(pngPath)
            }
        } catch (err) {
            console.error(err)
        }
    }

    async bakeCharts(
        opts: {
            regenConfig?: boolean
            regenData?: boolean
            regenImages?: boolean
        } = {}
    ) {
        const rows = await db.query(
            `SELECT id, config FROM charts WHERE JSON_EXTRACT(config, "$.isPublished")=true ORDER BY JSON_EXTRACT(config, "$.slug") ASC`
        )

        const newSlugs = []
        let requests = []
        for (const row of rows) {
            const chart: ChartConfigProps = JSON.parse(row.config)
            chart.id = row.id
            newSlugs.push(chart.slug)

            requests.push(this.bakeChart(chart))
            // Execute in batches
            if (requests.length > 50) {
                await Promise.all(requests)
                requests = []
            }
        }

        // Delete any that are missing from the database
        const oldSlugs = glob
            .sync(`${BAKED_SITE_DIR}/grapher/*.html`)
            .map(slug =>
                slug
                    .replace(`${BAKED_SITE_DIR}/grapher/`, "")
                    .replace(".html", "")
            )
        const toRemove = without(oldSlugs, ...newSlugs)
        for (const slug of toRemove) {
            console.log(`DELETING ${slug}`)
            try {
                const paths = [
                    `${BAKED_SITE_DIR}/grapher/${slug}.html`,
                    `${BAKED_SITE_DIR}/grapher/exports/${slug}.png`
                ] //, `${BAKED_SITE_DIR}/grapher/exports/${slug}.svg`]
                await Promise.all(paths.map(p => fs.unlink(p)))
                paths.map(p => this.stage(p))
            } catch (err) {
                console.error(err)
            }
        }

        return Promise.all(requests)
    }

    async bakeAll() {
        this.flushCache()
        await this.bakeRedirects()
        await this.bakeEmbeds()
        await this.bakeBlogIndex()
        await bakeCountries(this)
        await this.bakeRSS()
        await this.bakeAssets()
        await this.bakeSpecialPages()
        await this.bakeGoogleScholar()
        await this.bakePosts()
        await this.bakeCharts()
    }

    async ensureDir(relPath: string) {
        const outPath = path.join(BAKED_SITE_DIR, relPath)
        await fs.mkdirp(outPath)
    }

    async writeFile(relPath: string, content: string) {
        const outPath = path.join(BAKED_SITE_DIR, relPath)
        await fs.writeFile(outPath, content)
        this.stage(outPath)
    }

    async stageWrite(outPath: string, content: string) {
        await fs.mkdirp(path.dirname(outPath))
        await fs.writeFile(outPath, content)
        this.stage(outPath)
    }

    stage(outPath: string, msg?: string) {
        console.log(msg || outPath)
    }

    exec(cmd: string) {
        console.log(cmd)
        shell.exec(cmd)
    }

    async deploy(commitMsg: string, authorEmail?: string, authorName?: string) {
        // Deploy directly to Netlify (faster than using the github hook)
        if (fs.existsSync(path.join(BAKED_SITE_DIR, ".netlify/state.json"))) {
            this.exec(
                `cd ${BAKED_SITE_DIR} && ${BASE_DIR}/node_modules/.bin/netlify deploy -d . --prod`
            )
        }

        // Ensure there is a git repo in there
        this.exec(`cd ${BAKED_SITE_DIR} && git init`)

        // Prettify HTML source for easier debugging
        // Target root level HTML files only (entries and posts) for performance
        // reasons.
        // TODO: check again --only-changed
        // this.exec(`cd ${BAKED_SITE_DIR} && ${BASE_DIR}/node_modules/.bin/prettier --write "./*.html"`)

        if (authorEmail && authorName && commitMsg) {
            this.exec(
                `cd ${BAKED_SITE_DIR} && git add -A . && git commit --author='${authorName} <${authorEmail}>' -a -m '${commitMsg}' && git push origin master`
            )
        } else {
            this.exec(
                `cd ${BAKED_SITE_DIR} && git add -A . && git commit -a -m '${commitMsg}' && git push origin master`
            )
        }
    }

    end() {
        wpdb.end()
        db.end()
    }

    flushCache() {
        wpdb.flushCache()
    }
}
