import * as React from "react"
import * as ReactDOMServer from "react-dom/server"
import * as fs from "fs-extra"
import * as lodash from "lodash"
import * as sharp from "sharp"
import * as path from "path"
import * as parseUrl from "url-parse"
import * as md5 from "md5"
import { format } from "prettier"

import { ClientSettings } from "clientSettings"

import * as db from "db/db"
import { getVariableData } from "db/model/Variable"
import { ChartConfigProps, ChartConfig } from "charts/ChartConfig"
import { JsonError } from "utils/server/serverUtil"
import { Chart } from "db/model/Chart"
import { ChartPage } from "site/server/views/ChartPage"
import { Post } from "db/model/Post"
import { urlToSlug } from "charts/Util"

// Todo: should these lines be somewhere else?
declare var global: any
global.window = { location: { search: "" } }
global.App = { isEditor: false }

export async function chartDataJson(variableIds: number[]) {
    return await getVariableData(variableIds)
}

export async function renderReactChartPageToHtml(
    slug: string,
    clientSettings: ClientSettings
) {
    const chart = await Chart.getBySlug(slug)

    if (!chart) throw new JsonError("No such chart", 404)

    const c: ChartConfigProps = chart.config
    c.id = chart.id

    const postSlug = urlToSlug(c.originUrl || "")
    const post = postSlug ? await Post.bySlug(postSlug) : undefined

    return `<!doctype html>${ReactDOMServer.renderToStaticMarkup(
        <ChartPage chart={c} post={post} clientSettings={clientSettings} />
    )}`
}

export async function chartToSVG(
    jsonConfig: ChartConfigProps,
    vardata: any
): Promise<string> {
    const chart = new ChartConfig(jsonConfig)
    chart.isLocalExport = true
    chart.vardata.receiveData(vardata)
    return chart.staticSVG
}

async function bakeImageExports(
    outDir: string,
    jsonConfig: ChartConfigProps,
    vardata: any
) {
    const chart = new ChartConfig(jsonConfig)
    chart.isLocalExport = true
    chart.vardata.receiveData(vardata)
    const outPath = path.join(outDir, chart.props.slug as string)

    return Promise.all([
        fs
            .writeFile(`${outPath}.svg`, chart.staticSVG)
            .then(_ => console.log(`${outPath}.svg`)),
        sharp(Buffer.from(chart.staticSVG), { density: 144 })
            .png()
            .resize(chart.idealBounds.width, chart.idealBounds.height)
            .flatten({ background: "#ffffff" })
            .toFile(`${outPath}.png`)
    ])
}

async function getChartsBySlug() {
    const chartsBySlug: Map<string, ChartConfigProps> = new Map()
    const chartsById = new Map()

    const chartsQuery = db.query(`SELECT * FROM charts`)
    const redirectQuery = db.query(
        `SELECT slug, chart_id FROM chart_slug_redirects`
    )

    for (const row of await chartsQuery) {
        const chart = JSON.parse(row.config)
        chart.id = row.id
        chartsBySlug.set(chart.slug, chart)
        chartsById.set(row.id, chart)
    }

    for (const row of await redirectQuery) {
        chartsBySlug.set(row.slug, chartsById.get(row.chart_id))
    }

    return chartsBySlug
}

export async function bakeChartsToImages(chartUrls: string[], outDir: string) {
    await fs.mkdirp(outDir)
    const chartsBySlug = await getChartsBySlug()

    for (const urlStr of chartUrls) {
        const url = parseUrl(urlStr)
        const slug = lodash.last(url.pathname.split("/")) as string
        const jsonConfig = chartsBySlug.get(slug)
        if (jsonConfig) {
            const queryStr = url.query as any

            const chart = new ChartConfig(jsonConfig, { queryStr: queryStr })
            chart.isLocalExport = true
            const { width, height } = chart.idealBounds
            const outPath = `${outDir}/${slug}${
                queryStr ? "-" + (md5(queryStr) as string) : ""
            }_v${jsonConfig.version}_${width}x${height}.svg`
            console.log(outPath)

            if (!fs.existsSync(outPath)) {
                const variableIds = lodash.uniq(
                    chart.dimensions.map(d => d.variableId)
                )
                const vardata = await getVariableData(variableIds)
                chart.vardata.receiveData(vardata)
                fs.writeFile(outPath, chart.staticSVG)
            }
        }
    }
}

class VariableFileBaker {
    private variableIds: number[]
    private outputFolder: string
    constructor(variableIds: number[], outputFolder: string) {
        this.variableIds = variableIds
        this.outputFolder = outputFolder
    }

    async bake() {
        if (!this.variableIds.length) return
        await fs.mkdirp(this.outputFolder)
        const vardata = await getVariableData(this.variableIds)
        await fs.writeFile(this.vardataPath, JSON.stringify(vardata))
        this.stage(this.vardataPath)
    }

    get vardataPath() {
        return `${this.outputFolder}${this.variableIds.join("+")}.json`
    }

    doesVardataFileExists() {
        return fs.existsSync(this.vardataPath)
    }

    stage(outPath: string, msg?: string) {
        console.log(msg || outPath)
    }
}

export class ChartBaker {
    private config: ChartConfigProps
    private htmlFileOutputFolder: string
    private variableFilesOutputFolder: string
    private imageFilesOutputFolder: string
    private clientSettings: ClientSettings
    constructor(
        config: ChartConfigProps,
        outputFolder: string,
        clientSettings: ClientSettings
    ) {
        this.config = config
        this.htmlFileOutputFolder = outputFolder
        this.variableFilesOutputFolder = outputFolder + `data/variables/`
        this.imageFilesOutputFolder = outputFolder + `exports/`
        this.clientSettings = clientSettings
    }

    stage(outPath: string, msg?: string) {
        console.log(msg || outPath)
    }

    private getVariableFileBaker() {
        return new VariableFileBaker(
            lodash.uniq(this.config.dimensions.map(d => d.variableId)),
            this.variableFilesOutputFolder
        )
    }

    private get htmlFilePath() {
        return `${this.htmlFileOutputFolder}${this.config.slug}.html`
    }

    private async isHtmlFileSameVersion() {
        let isSameVersion = false
        try {
            // If the chart is the same version, we can potentially skip baking the data and exports (which is by far the slowest part)
            const html = await fs.readFile(this.htmlFilePath, "utf8")
            const match = html.match(/jsonConfig\s*=\s*(\{.+\})/)
            if (match) {
                const fileVersion = JSON.parse(match[1]).version
                isSameVersion = this.config.version === fileVersion
            }
        } catch (err) {
            if (err.code !== "ENOENT") console.error(err)
        }
        return isSameVersion
    }

    async bakeAll() {
        try {
            const variableFileBaker = this.getVariableFileBaker()
            // Make sure we bake the variables successfully before outputing the chart html
            if (
                !this.isHtmlFileSameVersion() ||
                !variableFileBaker.doesVardataFileExists()
            )
                await variableFileBaker.bake()

            // Always bake the html for every chart; it's cheap to do so
            await this.bakeHtmlPage()

            // Only bake images if needed
            if (!this.isHtmlFileSameVersion || !this.bothImageFilesExist)
                await this.bakeImages()
        } catch (err) {
            console.log(`Error baking chart '${this.config.slug}'`)
            console.log(err)
        }
    }

    private async getVariableData() {
        const variableFileBaker = this.getVariableFileBaker()
        const data = await fs.readFile(variableFileBaker.vardataPath, "utf8")
        return JSON.parse(data)
    }

    private get svgPath() {
        return `${this.imageFilesOutputFolder}${this.config.slug}.svg`
    }

    private get pngPath() {
        return `${this.imageFilesOutputFolder}${this.config.slug}.png`
    }

    private get bothImageFilesExist() {
        return fs.existsSync(this.svgPath) && fs.existsSync(this.pngPath)
    }

    async bakeImages() {
        try {
            await fs.mkdirp(this.imageFilesOutputFolder)
            const vardata = await this.getVariableData()
            await bakeImageExports(
                this.imageFilesOutputFolder,
                this.config,
                vardata
            )
            this.stage(this.svgPath)
            this.stage(this.pngPath)
        } catch (err) {
            console.error(err)
        }
    }

    async bakeHtmlPage() {
        const outPath = this.htmlFilePath
        let content = await renderReactChartPageToHtml(
            this.config.slug as string,
            this.clientSettings
        )
        if (true)
            content = format(content, {
                semi: false,
                printWidth: 240,
                filepath: outPath
            })
        await fs.writeFile(outPath, content)
        this.stage(outPath)
    }
}
